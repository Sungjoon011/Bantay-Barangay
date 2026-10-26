# Data Dictionary — Bantay-Barangay

Generated from the PostgreSQL (Neon) schema. Types are PostgreSQL types; `enum` columns show the enum name.
Regenerate any time with the query at the bottom of this file.

## Tables

| Table | Purpose |
|---|---|
| Announcement | Announcements posted by staff. |
| Appointment | Appointments booked by residents at the barangay hall. |
| BarangayProgram | Barangay programs/events (feeding program, vaccination drive...). |
| BlotterParty | JUNCTION (N:M) IncidentBlotter <-> Resident. Intersection attributes: partyRole, statement, statementDate. |
| BusinessPermit | Business permit applications, approved by an official. |
| DocumentRequest | A resident's request for a barangay document (clearance, certificate...). Staff move the status only through sp_process_document_request (Pending → Processing → Ready → Claimed, or Rejected). Residents can cancel an unpaid/free request (status Cancelled); an online payment releases it to Ready. |
| Household | A household/address. Single source of truth for address and purok (Resident does not repeat them). |
| IncidentBlotter | Incident (blotter) case with a confidentiality level. Staff cannot see VAWC / Restricted cases. |
| Payment | Payment of a document request OR a business permit (exactly one, enforced by a CHECK constraint). A document request's payment is created together with the request (fee stamped by trigger; free documents start as Paid); paymentMethod 'PayMongo' = paid online. |
| PrivateAccount | Login accounts of barangay personnel. Holds the system role (Admin / Staff / Official), credentials (bcrypt hash) and account status. |
| PublicAccount | Optional resident self-service login (email / phone + password hash). |
| Resident | A person living in the barangay. Belongs to one household; may link to one public account. No double residents: a unique index on (lower(trim(firstName)), lower(trim(lastName)), birthDate) refuses a second copy. |
| ResidentProgram | JUNCTION (N:M) BarangayProgram <-> Resident. Intersection attributes: registeredAt, attendanceStatus, recordedByStaffId. |
| StaffOfficial | Personnel profile. Exactly one per private account (1:1). Referenced by the records a staff member processed. |
| SystemAuditLog | Audit trail written by database triggers (action, table, who, when). |

### Announcement

Announcements posted by staff.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| announcementId | integer | no | auto-increment | PK |
| postedByStaffId | integer | no |  | FK → StaffOfficial.staffId (ON DELETE RESTRICT) |
| title | text | no |  |  |
| messageBody | text | no |  |  |
| targetAudience | text | no | 'All'::text |  |
| datePosted | timestamp without time zone | no | CURRENT_TIMESTAMP |  |

### Appointment

Appointments booked by residents at the barangay hall.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| appointmentId | integer | no | auto-increment | PK |
| residentId | integer | no |  | FK → Resident.residentId (ON DELETE RESTRICT) |
| purpose | text | no |  |  |
| scheduledDate | date | no |  |  |
| scheduledTime | time without time zone | no |  |  |
| status | text | no | 'Upcoming'::text |  |

### BarangayProgram

Barangay programs/events (feeding program, vaccination drive...).

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| programId | integer | no | auto-increment | PK |
| createdByStaffId | integer | no |  | FK → StaffOfficial.staffId (ON DELETE RESTRICT) |
| title | text | no |  |  |
| description | text | yes |  |  |
| venue | text | no |  |  |
| programDate | timestamp without time zone | no |  |  |

### BlotterParty

JUNCTION (N:M) IncidentBlotter <-> Resident. Intersection attributes: partyRole, statement, statementDate.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| caseId | integer | no |  | FK → IncidentBlotter.caseId (ON DELETE CASCADE); PK |
| residentId | integer | no |  | FK → Resident.residentId (ON DELETE RESTRICT); PK |
| partyRole | PartyRole | no |  | PK |
| statement | text | yes |  |  |
| statementDate | timestamp without time zone | no | CURRENT_TIMESTAMP |  |

### BusinessPermit

Business permit applications, approved by an official.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| permitId | integer | no | auto-increment | PK |
| residentId | integer | no |  | FK → Resident.residentId (ON DELETE RESTRICT) |
| approvedByStaffId | integer | yes |  | FK → StaffOfficial.staffId (ON DELETE SET NULL) |
| businessName | text | no |  |  |
| businessType | text | no |  |  |
| status | PermitStatus | no | 'Pending'::"PermitStatus" |  |
| applicationDate | date | no |  |  |

### DocumentRequest

A resident's request for a barangay document (clearance, certificate...). Status is moved only by sp_process_document_request.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| requestId | integer | no | auto-increment | PK |
| residentId | integer | no |  | FK → Resident.residentId (ON DELETE RESTRICT) |
| processedByStaffId | integer | yes |  | FK → StaffOfficial.staffId (ON DELETE SET NULL) |
| documentType | text | no |  |  |
| purpose | text | no |  |  |
| status | RequestStatus | no | 'Pending'::"RequestStatus" |  |
| requestDate | timestamp without time zone | no | CURRENT_TIMESTAMP |  |

### Household

A household/address. Single source of truth for address and purok (Resident does not repeat them).

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| householdId | integer | no | auto-increment | PK |
| headOfFamilyId | integer | yes |  |  |
| addressDetails | text | no |  |  |
| purokZone | text | no |  |  |

### IncidentBlotter

Incident (blotter) case with a confidentiality level. Staff cannot see VAWC / Restricted cases.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| caseId | integer | no | auto-increment | PK |
| complainantId | integer | no |  | FK → Resident.residentId (ON DELETE RESTRICT) |
| recordedByStaffId | integer | no |  | FK → StaffOfficial.staffId (ON DELETE RESTRICT) |
| respondentName | text | no |  |  |
| incidentType | text | no |  |  |
| description | text | no |  |  |
| confidentialityLevel | ConfidentialityLevel | no | 'Standard'::"ConfidentialityLevel" |  |
| status | BlotterStatus | no | 'Open'::"BlotterStatus" |  |
| dateOfIncident | timestamp without time zone | no |  |  |

### Payment

Payment of a document request OR a business permit (exactly one, enforced by a CHECK constraint). Created by the stored procedures.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| paymentId | integer | no | auto-increment | PK |
| transactionType | TransactionType | no |  |  |
| requestId | integer | yes |  | FK → DocumentRequest.requestId (ON DELETE SET NULL) |
| permitId | integer | yes |  | FK → BusinessPermit.permitId (ON DELETE SET NULL) |
| amount | numeric | no |  |  |
| orNumber | text | yes |  |  |
| paymentMethod | PaymentMethod | no |  |  |
| paymentStatus | PaymentStatus | no | 'Unpaid'::"PaymentStatus" |  |
| datePaid | timestamp without time zone | yes |  |  |
| checkoutSessionId | text | yes |  | PayMongo checkout session of an online payment (lets the API re-check it if the webhook is late) |

### PrivateAccount

Login accounts of barangay personnel. Holds the system role (Admin / Staff / Official), credentials (bcrypt hash) and account status.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| accountId | integer | no | auto-increment | PK |
| systemRole | SystemRole | no |  |  |
| email | text | no |  |  |
| passwordHash | text | no |  |  |
| accountStatus | AccountStatus | no | 'Active'::"AccountStatus" |  |

### PublicAccount

Optional resident self-service login (email / phone + password hash).

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| accountId | integer | no | auto-increment | PK |
| email | text | yes |  |  |
| phoneNumber | text | yes |  |  |
| passwordHash | text | no |  |  |
| accountStatus | AccountStatus | no | 'Active'::"AccountStatus" |  |

### Resident

A person living in the barangay. Belongs to one household; may link to one public account.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| residentId | integer | no | auto-increment | PK |
| accountId | integer | yes |  | FK → PublicAccount.accountId (ON DELETE SET NULL) |
| householdId | integer | no |  | FK → Household.householdId (ON DELETE RESTRICT) |
| firstName | text | no |  |  |
| lastName | text | no |  |  |
| birthDate | date | no |  |  |
| gender | Gender | yes |  |  |
| civilStatus | text | yes |  |  |
| qrCodeString | text | yes |  |  |
| recordStatus | ResidentRecordStatus | no | 'Active'::"ResidentRecordStatus" | Active / Moved / Deceased |
| contactNumber | text | yes |  |  |
| residentCode | text | yes | generated: 'BB-' + residentId padded to 6 digits | UNIQUE. Readable resident ID (e.g. BB-000012), filled by the database |

### ResidentProgram

JUNCTION (N:M) BarangayProgram <-> Resident. Intersection attributes: registeredAt, attendanceStatus, recordedByStaffId.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| programId | integer | no |  | FK → BarangayProgram.programId (ON DELETE CASCADE); PK |
| residentId | integer | no |  | FK → Resident.residentId (ON DELETE RESTRICT); PK |
| recordedByStaffId | integer | yes |  | FK → StaffOfficial.staffId (ON DELETE SET NULL) |
| registeredAt | timestamp without time zone | no | CURRENT_TIMESTAMP |  |
| attendanceStatus | AttendanceStatus | no | 'Registered'::"AttendanceStatus" |  |

### StaffOfficial

Personnel profile. Exactly one per private account (1:1). Referenced by the records a staff member processed.

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| staffId | integer | no | auto-increment | PK |
| accountId | integer | no |  | FK → PrivateAccount.accountId (ON DELETE RESTRICT) |
| firstName | text | no |  |  |
| lastName | text | no |  |  |
| positionTitle | text | no |  |  |
| recordStatus | StaffRecordStatus | no | 'Active'::"StaffRecordStatus" |  |

### SystemAuditLog

Audit trail written by database triggers (action, table, who, when).

| Column | Type | Null? | Default | Key / Constraint |
|---|---|---|---|---|
| logId | integer | no | auto-increment | PK |
| accountId | integer | yes |  | FK → PrivateAccount.accountId (ON DELETE RESTRICT) |
| actionPerformed | text | no |  |  |
| tableAffected | text | no |  |  |
| timestamp | timestamp without time zone | no | CURRENT_TIMESTAMP |  |
| ipAddress | text | yes |  |  |

## Server-side automation

| Object | Type | What it does |
|---|---|---|
| fn_audit_resident / trg_audit_resident | trigger | Logs INSERT/UPDATE/DELETE on Resident into SystemAuditLog |
| fn_audit_generic + 5 triggers | trigger | Same for DocumentRequest, IncidentBlotter, Payment, BusinessPermit and credential changes on PrivateAccount |
| sp_process_document_request | stored procedure | Row-locks the request, validates the status workflow, creates the Payment when Ready, blocks release when unpaid |
| sp_record_payment | stored procedure | Marks the payment Paid with OR number and date |
| fn_resident_age | function | Age from birth date |
| fn_barangay_stats | function | Dashboard counts in one call |
| vw_resident_directory | view | Resident + household address (joins instead of duplicating columns) |
| vw_document_queue | view | Document requests with resident name and payment status |
| fn_report_registry | function | Registry report: residents per purok (registered / active / moved / deceased / with online account) plus a barangay total row |
| vw_duplicate_residents | view | Lists residents entered more than once (same name + birth date); empty when clean |
| Resident_no_duplicates_idx | unique index | Database-level guarantee that the same person cannot be registered twice |
| Resident_residentCode_key | unique index | Every resident has a unique readable ID |

## Many-to-many relationships (junction tables)

- IncidentBlotter ⇄ Resident through **BlotterParty** (composite PK: caseId + residentId + partyRole)
- BarangayProgram ⇄ Resident through **ResidentProgram** (composite PK: programId + residentId)

## Regenerate this dictionary

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```
