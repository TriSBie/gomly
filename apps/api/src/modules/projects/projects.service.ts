import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Issue, Project } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import type {
  AttachIssueToProjectDto,
  CreateProjectDto,
  UpdateProjectDto,
} from "./dto/projects.dto";

type IssueWithTeamKey = Issue & { team?: { key: string } | null };

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  ping() {
    return { module: "projects", status: "ok" };
  }

  async createProject(
    userId: string,
    workspaceId: string,
    dto: CreateProjectDto,
  ) {
    await this.requireMembership(userId, workspaceId);
    const project = await this.prisma.project.create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      },
    });
    return this.withProgress(project, {
      totalIssues: 0,
      doneIssues: 0,
      progressPercent: 0,
    });
  }

  async listProjects(userId: string, workspaceId: string) {
    await this.requireMembership(userId, workspaceId);
    const projects = await this.prisma.project.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      projects.map(async (project) =>
        this.withProgress(project, await this.computeProgress(project.id)),
      ),
    );
  }

  async getProject(userId: string, projectId: string) {
    const project = await this.requireProjectAccess(userId, projectId);
    const [progress, issues] = await Promise.all([
      this.computeProgress(project.id),
      this.prisma.issue.findMany({
        where: { projectId: project.id },
        include: { team: { select: { key: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      ...this.withProgress(project, progress),
      issues: issues.map((issue) => this.toIssueSummary(issue)),
    };
  }

  async updateProject(
    userId: string,
    projectId: string,
    dto: UpdateProjectDto,
  ) {
    const project = await this.requireProjectAccess(userId, projectId);
    const data: Prisma.ProjectUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.targetDate !== undefined) {
      data.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    }
    if (dto.status !== undefined) data.status = dto.status;
    const updated = await this.prisma.project.update({
      where: { id: project.id },
      data,
    });
    return this.withProgress(updated, await this.computeProgress(updated.id));
  }

  async addIssue(
    userId: string,
    projectId: string,
    dto: AttachIssueToProjectDto,
  ) {
    const project = await this.requireProjectAccess(userId, projectId);
    const issue = await this.prisma.issue.findUnique({
      where: { id: dto.issueId },
    });
    // Issue phải cùng workspace với project — khác workspace coi như không tồn tại.
    if (!issue || issue.workspaceId !== project.workspaceId) {
      throw new NotFoundException("Issue không tồn tại");
    }
    const updated = await this.prisma.issue.update({
      where: { id: issue.id },
      data: { projectId: project.id },
      include: { team: { select: { key: true } } },
    });
    return this.toIssueSummary(updated);
  }

  async removeIssue(userId: string, projectId: string, issueId: string) {
    const project = await this.requireProjectAccess(userId, projectId);
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });
    if (!issue || issue.projectId !== project.id) {
      throw new NotFoundException("Issue không thuộc project này");
    }
    const updated = await this.prisma.issue.update({
      where: { id: issue.id },
      data: { projectId: null },
      include: { team: { select: { key: true } } },
    });
    return this.toIssueSummary(updated);
  }

  // ---------- Helpers ----------

  /** Lấy project + kiểm membership theo workspace của project. Non-member → 404. */
  private async requireProjectAccess(
    userId: string,
    projectId: string,
  ): Promise<Project> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException("Project không tồn tại");
    }
    await this.requireMembership(userId, project.workspaceId);
    return project;
  }

  /**
   * Kiểm tra membership. Không phải thành viên → 404 (không phải 403):
   * không rò rỉ sự tồn tại của workspace của người khác (theo architecture.md).
   */
  private async requireMembership(userId: string, workspaceId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) {
      throw new NotFoundException("Workspace không tồn tại");
    }
    return membership;
  }

  /** Tiến độ project: Done = statusGroup DONE (theo schema Issue). */
  private async computeProgress(projectId: string) {
    const [totalIssues, doneIssues] = await Promise.all([
      this.prisma.issue.count({ where: { projectId } }),
      this.prisma.issue.count({
        where: { projectId, statusGroup: "DONE" },
      }),
    ]);
    return {
      totalIssues,
      doneIssues,
      progressPercent:
        totalIssues === 0 ? 0 : Math.round((doneIssues / totalIssues) * 100),
    };
  }

  private withProgress(
    project: Project,
    progress: {
      totalIssues: number;
      doneIssues: number;
      progressPercent: number;
    },
  ) {
    // Vừa gắn phẳng (totalIssues/doneIssues/progressPercent) vừa lồng `progress`
    // để client dùng kiểu nào cũng được.
    return { ...project, ...progress, progress };
  }

  /** Gắn `key` hiển thị (VD DEV-1) từ team.key + number — schema Issue không có cột key. */
  private toIssueSummary(issue: IssueWithTeamKey) {
    const { team, ...rest } = issue;
    return {
      ...rest,
      key: team?.key ? `${team.key}-${issue.number}` : null,
    };
  }
}
