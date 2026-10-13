-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('Admin', 'Staff', 'Official');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('Active', 'Inactive', 'Banned');

-- CreateEnum
CREATE TYPE "StaffRecordStatus" AS ENUM ('Active', 'Resigned');

-- CreateEnum
CREATE TYPE "ResidentRecordStatus" AS ENUM ('Active', 'Moved', 'Deceased');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female', 'Other');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('Pending', 'Processing', 'Ready', 'Claimed', 'Rejected');

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Expired');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('Unpaid', 'Paid', 'Refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('Cash', 'GCash', 'Maya');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('Document', 'BusinessPermit');

-- CreateEnum
CREATE TYPE "BlotterStatus" AS ENUM ('Open', 'Settled', 'Escalated');

-- CreateEnum
CREATE TYPE "ConfidentialityLevel" AS ENUM ('Standard', 'VAWC', 'Restricted');

-- CreateTable
CREATE TABLE "PrivateAccount" (
    "accountId" SERIAL NOT NULL,
    "systemRole" "SystemRole" NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'Active',

    CONSTRAINT "PrivateAccount_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "StaffOfficial" (
    "staffId" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "positionTitle" TEXT NOT NULL,
    "recordStatus" "StaffRecordStatus" NOT NULL DEFAULT 'Active',

    CONSTRAINT "StaffOfficial_pkey" PRIMARY KEY ("staffId")
);

-- CreateTable
CREATE TABLE "SystemAuditLog" (
    "logId" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "actionPerformed" TEXT NOT NULL,
    "tableAffected" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "SystemAuditLog_pkey" PRIMARY KEY ("logId")
);

-- CreateTable
CREATE TABLE "PublicAccount" (
    "accountId" SERIAL NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "passwordHash" TEXT NOT NULL,
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'Active',

    CONSTRAINT "PublicAccount_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "Household" (
    "householdId" SERIAL NOT NULL,
    "headOfFamilyId" INTEGER,
    "addressDetails" TEXT NOT NULL,
    "purokZone" TEXT NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("householdId")
);

-- CreateTable
CREATE TABLE "Resident" (
    "residentId" SERIAL NOT NULL,
    "accountId" INTEGER,
    "householdId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "gender" "Gender" NOT NULL,
    "civilStatus" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "purokZone" TEXT NOT NULL,
    "qrCodeString" TEXT,
    "recordStatus" "ResidentRecordStatus" NOT NULL DEFAULT 'Active',

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("residentId")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "announcementId" SERIAL NOT NULL,
    "postedByStaffId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL DEFAULT 'All',
    "datePosted" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("announcementId")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "appointmentId" SERIAL NOT NULL,
    "residentId" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "scheduledTime" TIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Upcoming',

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("appointmentId")
);

-- CreateTable
CREATE TABLE "IncidentBlotter" (
    "caseId" SERIAL NOT NULL,
    "complainantId" INTEGER NOT NULL,
    "recordedByStaffId" INTEGER NOT NULL,
    "respondentName" TEXT NOT NULL,
    "incidentType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidentialityLevel" "ConfidentialityLevel" NOT NULL DEFAULT 'Standard',
    "status" "BlotterStatus" NOT NULL DEFAULT 'Open',
    "dateOfIncident" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentBlotter_pkey" PRIMARY KEY ("caseId")
);

-- CreateTable
CREATE TABLE "DocumentRequest" (
    "requestId" SERIAL NOT NULL,
    "residentId" INTEGER NOT NULL,
    "processedByStaffId" INTEGER,
    "documentType" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'Pending',
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "BusinessPermit" (
    "permitId" SERIAL NOT NULL,
    "residentId" INTEGER NOT NULL,
    "approvedByStaffId" INTEGER,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "status" "PermitStatus" NOT NULL DEFAULT 'Pending',
    "applicationDate" DATE NOT NULL,

    CONSTRAINT "BusinessPermit_pkey" PRIMARY KEY ("permitId")
);

-- CreateTable
CREATE TABLE "Payment" (
    "paymentId" SERIAL NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "requestId" INTEGER,
    "permitId" INTEGER,
    "amount" DECIMAL(10,2) NOT NULL,
    "orNumber" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'Unpaid',
    "datePaid" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("paymentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrivateAccount_email_key" ON "PrivateAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffOfficial_accountId_key" ON "StaffOfficial"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicAccount_email_key" ON "PublicAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PublicAccount_phoneNumber_key" ON "PublicAccount"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_accountId_key" ON "Resident"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_qrCodeString_key" ON "Resident"("qrCodeString");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_requestId_key" ON "Payment"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_permitId_key" ON "Payment"("permitId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orNumber_key" ON "Payment"("orNumber");

-- AddForeignKey
ALTER TABLE "StaffOfficial" ADD CONSTRAINT "StaffOfficial_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PrivateAccount"("accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAuditLog" ADD CONSTRAINT "SystemAuditLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PrivateAccount"("accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PublicAccount"("accountId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("householdId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_postedByStaffId_fkey" FOREIGN KEY ("postedByStaffId") REFERENCES "StaffOfficial"("staffId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("residentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentBlotter" ADD CONSTRAINT "IncidentBlotter_complainantId_fkey" FOREIGN KEY ("complainantId") REFERENCES "Resident"("residentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentBlotter" ADD CONSTRAINT "IncidentBlotter_recordedByStaffId_fkey" FOREIGN KEY ("recordedByStaffId") REFERENCES "StaffOfficial"("staffId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("residentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_processedByStaffId_fkey" FOREIGN KEY ("processedByStaffId") REFERENCES "StaffOfficial"("staffId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPermit" ADD CONSTRAINT "BusinessPermit_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("residentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPermit" ADD CONSTRAINT "BusinessPermit_approvedByStaffId_fkey" FOREIGN KEY ("approvedByStaffId") REFERENCES "StaffOfficial"("staffId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DocumentRequest"("requestId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "BusinessPermit"("permitId") ON DELETE SET NULL ON UPDATE CASCADE;
