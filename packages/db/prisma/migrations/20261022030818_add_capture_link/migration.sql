-- CreateTable
CREATE TABLE "CaptureLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "teamId" TEXT,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "createdById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaptureLink_token_key" ON "CaptureLink"("token");

-- CreateIndex
CREATE INDEX "CaptureLink_workspaceId_idx" ON "CaptureLink"("workspaceId");

-- AddForeignKey
ALTER TABLE "CaptureLink" ADD CONSTRAINT "CaptureLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureLink" ADD CONSTRAINT "CaptureLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureLink" ADD CONSTRAINT "CaptureLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
