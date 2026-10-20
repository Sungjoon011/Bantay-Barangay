-- 02_junction_tables.sql
-- BlotterParty    : IncidentBlotter <-> Resident  (role, statement, statementDate)
-- ResidentProgram : BarangayProgram <-> Resident  (registeredAt, attendanceStatus, recordedBy)

CREATE TYPE "PartyRole" AS ENUM ('Complainant', 'Respondent', 'Witness');
CREATE TYPE "AttendanceStatus" AS ENUM ('Registered', 'Attended', 'NoShow', 'Cancelled');

CREATE TABLE "BarangayProgram" (
    "programId" SERIAL NOT NULL,
    "createdByStaffId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "venue" TEXT NOT NULL,
    "programDate" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BarangayProgram_pkey" PRIMARY KEY ("programId")
);

CREATE TABLE "BlotterParty" (
    "caseId" INTEGER NOT NULL,
    "residentId" INTEGER NOT NULL,
    "partyRole" "PartyRole" NOT NULL,
    "statement" TEXT,
    "statementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlotterParty_pkey" PRIMARY KEY ("caseId", "residentId", "partyRole")
);

CREATE TABLE "ResidentProgram" (
    "programId" INTEGER NOT NULL,
    "residentId" INTEGER NOT NULL,
    "recordedByStaffId" INTEGER,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendanceStatus" "AttendanceStatus" NOT NULL DEFAULT 'Registered',
    CONSTRAINT "ResidentProgram_pkey" PRIMARY KEY ("programId", "residentId")
);

CREATE INDEX "BarangayProgram_programDate_idx" ON "BarangayProgram"("programDate");
CREATE INDEX "BlotterParty_residentId_idx" ON "BlotterParty"("residentId");
CREATE INDEX "ResidentProgram_residentId_idx" ON "ResidentProgram"("residentId");

ALTER TABLE "BarangayProgram" ADD CONSTRAINT "BarangayProgram_createdByStaffId_fkey"
    FOREIGN KEY ("createdByStaffId") REFERENCES "StaffOfficial"("staffId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BlotterParty" ADD CONSTRAINT "BlotterParty_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "IncidentBlotter"("caseId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlotterParty" ADD CONSTRAINT "BlotterParty_residentId_fkey"
    FOREIGN KEY ("residentId") REFERENCES "Resident"("residentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResidentProgram" ADD CONSTRAINT "ResidentProgram_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "BarangayProgram"("programId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResidentProgram" ADD CONSTRAINT "ResidentProgram_residentId_fkey"
    FOREIGN KEY ("residentId") REFERENCES "Resident"("residentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResidentProgram" ADD CONSTRAINT "ResidentProgram_recordedByStaffId_fkey"
    FOREIGN KEY ("recordedByStaffId") REFERENCES "StaffOfficial"("staffId") ON DELETE SET NULL ON UPDATE CASCADE;