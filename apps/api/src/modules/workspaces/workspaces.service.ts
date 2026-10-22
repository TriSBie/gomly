import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Membership, MembershipRole, User } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../common/prisma.service";
import type {
  AddMemberDto,
  CreateTeamDto,
  CreateWorkspaceDto,
} from "./dto/workspaces.dto";

/** Hình dạng 1 thành viên trả ra API (từ Membership kèm thông tin User). */
export interface MemberView {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: MembershipRole;
  joinedAt: Date;
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  ping() {
    return { module: "workspaces", status: "ok" };
  }

  async createWorkspace(userId: string, dto: CreateWorkspaceDto) {
    const name = dto.name.trim();
    const slug = await this.uniqueSlug(name);
    const workspace = await this.prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({ data: { name, slug } });
      await tx.membership.create({
        data: { workspaceId: ws.id, userId, role: "OWNER" },
      });
      return ws;
    });
    return { ...workspace, role: "OWNER" as const };
  }

  async listWorkspaces(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({ ...m.workspace, role: m.role }));
  }

  async getWorkspace(userId: string, workspaceId: string) {
    const membership = await this.requireMembership(userId, workspaceId);
    return { ...membership.workspace, role: membership.role };
  }

  async createTeam(userId: string, workspaceId: string, dto: CreateTeamDto) {
    await this.requireMembership(userId, workspaceId);
    const key = dto.key.trim().toUpperCase();
    try {
      return await this.prisma.team.create({
        data: { workspaceId, name: dto.name.trim(), key },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Key team đã tồn tại trong workspace này");
      }
      throw error;
    }
  }

  async listTeams(userId: string, workspaceId: string) {
    await this.requireMembership(userId, workspaceId);
    return this.prisma.team.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
  }

  // ---------- Thành viên workspace ----------

  private toMemberView(membership: Membership & { user: User }): MemberView {
    return {
      userId: membership.userId,
      email: membership.user.email,
      name: membership.user.name,
      avatarUrl: membership.user.avatarUrl,
      role: membership.role,
      joinedAt: membership.createdAt,
    };
  }

  /**
   * Quyền quản trị thành viên (thêm/xóa): chỉ OWNER/ADMIN. Người gọi không
   * phải thành viên -> 404 (qua requireMembership); là thành viên thường
   * (MEMBER/GUEST) -> 403 rõ ràng vì họ đã biết workspace tồn tại.
   */
  private async requireMemberAdmin(userId: string, workspaceId: string) {
    const membership = await this.requireMembership(userId, workspaceId);
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw new ForbiddenException(
        "Chỉ OWNER hoặc ADMIN mới quản lý được thành viên của workspace",
      );
    }
    return membership;
  }

  /** GET /workspaces/:id/members — mọi thành viên đều xem được danh sách. */
  async listMembers(userId: string, workspaceId: string): Promise<MemberView[]> {
    await this.requireMembership(userId, workspaceId);
    const memberships = await this.prisma.membership.findMany({
      where: { workspaceId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => this.toMemberView(m));
  }

  /**
   * POST /workspaces/:id/members — thêm thành viên theo email.
   * - Chỉ OWNER/ADMIN (MEMBER/GUEST -> 403; non-member -> 404).
   * - Người được thêm phải ĐÃ có tài khoản Gomly: chưa có -> 404 kèm message rõ.
   * - Đã là thành viên -> 409. role = OWNER -> 400 (không gán qua API này).
   */
  async addMember(
    userId: string,
    workspaceId: string,
    dto: AddMemberDto,
  ): Promise<MemberView> {
    await this.requireMemberAdmin(userId, workspaceId);

    const role = dto.role ?? "MEMBER";
    if (role === "OWNER") {
      throw new BadRequestException(
        "Không gán vai trò OWNER qua API thêm thành viên",
      );
    }

    const email = dto.email.trim().toLowerCase();
    const target = await this.prisma.user.findUnique({ where: { email } });
    if (!target) {
      throw new NotFoundException("Người dùng chưa có tài khoản Gomly");
    }

    const existing = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: target.id } },
    });
    if (existing) {
      throw new ConflictException(
        "Người dùng này đã là thành viên của workspace",
      );
    }

    const membership = await this.prisma.membership.create({
      data: { workspaceId, userId: target.id, role },
      include: { user: true },
    });
    return this.toMemberView(membership);
  }

  /**
   * DELETE /workspaces/:id/members/:userId — xóa 1 thành viên.
   * - Chỉ OWNER/ADMIN (403/404 như addMember).
   * - Không xóa được OWNER cuối cùng của workspace -> 409. Tự xóa mình được
   *   nếu vẫn còn OWNER khác.
   * - userId đích không phải thành viên -> 404.
   */
  async removeMember(userId: string, workspaceId: string, targetUserId: string) {
    await this.requireMemberAdmin(userId, workspaceId);

    const target = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      include: { user: true },
    });
    if (!target) {
      throw new NotFoundException("Không tìm thấy thành viên trong workspace");
    }

    if (target.role === "OWNER") {
      const ownerCount = await this.prisma.membership.count({
        where: { workspaceId, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        throw new ConflictException(
          "Không xóa được OWNER cuối cùng của workspace",
        );
      }
    }

    await this.prisma.membership.delete({ where: { id: target.id } });
    return { removed: true, member: this.toMemberView(target) };
  }

  /**
   * Kiểm tra membership. Không phải thành viên → 404 (không phải 403):
   * theo architecture.md, không rò rỉ sự tồn tại của workspace của người khác.
   */
  private async requireMembership(userId: string, workspaceId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { workspace: true },
    });
    if (!membership) {
      throw new NotFoundException("Workspace không tồn tại");
    }
    return membership;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "workspace";
    let slug = base;
    while (await this.prisma.workspace.findUnique({ where: { slug } })) {
      slug = `${base}-${randomBytes(3).toString("hex")}`;
    }
    return slug;
  }
}
