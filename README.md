# 🏘️ Bantay-Baranggay Database

**Integrated Barangay Information and Service Management System: Database Design**

A centralized relational database that stores and organizes barangay data: resident records, document requests, blotter reports, permits, payments, and activity logs, all in one shared source of truth.

![Status](https://img.shields.io/badge/status-in%20development-yellow)
![Database](https://img.shields.io/badge/database-MySQL%20%7C%20PostgreSQL-4479A1)
![Design](https://img.shields.io/badge/design-ERD%20%7C%20Normalized-orange)
![Project](https://img.shields.io/badge/project-Final%20Project-blue)

---

## 📑 Table of Contents

- [Overview](#-overview)
- [The Problem](#-the-problem)
- [Key Features](#-key-features)
- [Database Tables](#-database-tables)
- [Entity Relationships](#-entity-relationships)
- [User Roles and Access](#-user-roles-and-access)
- [Tech Stack](#-tech-stack)
- [Roadmap](#-roadmap)
- [Team Members](#-team-members)

---

## 📖 Overview

The **Bantay-Baranggay Database** is the data foundation of a barangay information and service management system. It gives residents, barangay staff, and elected officials a single, shared database for everyday barangay records and services, replacing scattered paper files with organized, connected, and searchable data.

---

## ❗ The Problem

| Current situation | Impact |
|---|---|
| Paper-based records | Slow processing; records get lost or damaged |
| No single, shared database | Resident information is duplicated, inconsistent, or outdated |
| Records kept separately by different people | Hard to search, verify, or update information |
| No way to monitor data in real time | Officials can't easily see incidents, request volume, or community trends |
| No activity tracking | No accountability for who changed or approved a record |

## ✅ The Solution

Bantay-Baranggay Database replaces paper records with one centralized, normalized, and role-based database that keeps data accurate, connected, and auditable.

---

## ✨ Key Features

### 👥 Resident Management
- Household profiles and a digital census
- Centralized, searchable resident records

### 📄 Document Requests
- Stores clearance, indigency, and residency requests
- Tracks request status from submission to release
- Supports QR code verification data for authenticity checks

### 🚨 Blotter & Incident Records
- Stores blotter entries and complaints
- Case logs with full history

### 📢 Announcements & Alerts
- Stores barangay announcements and events
- Supports emergency alert records for SMS and app notifications

### 📅 Appointments
- Records scheduled office visits

### 🏪 Business Permits
- Tracks permit applications and approval status

### 💳 Fees & Payments
- Records fees for clearances and permits
- Payment history for accountability and reporting

### 📊 Reports & Analytics Support
- Data structured for population statistics
- Incident trends and request volume reports
- Permit revenue summaries

### 🔒 Activity Logging
- Records staff and official actions for accountability

---

## 🗄️ Database Tables

| Table | Description |
|---|---|
| `users` | Login accounts and roles (resident, staff, official, admin) |
| `residents` | Personal information of barangay residents |
| `households` | Household profiles linked to residents |
| `document_requests` | Clearance, indigency, and residency requests with status |
| `blotter_reports` | Incident and complaint records |
| `announcements` | Barangay announcements and emergency alerts |
| `appointments` | Scheduled office visits |
| `business_permits` | Business permit applications and approvals |
| `payments` | Fees paid for documents and permits |
| `activity_logs` | Record of staff and official actions |

Lack of Table For Staff, might share in users and residents for the names and household
---

## 🔗 Entity Relationships

- One **household** has many **residents**.
- One **resident** can have many **document requests**, **blotter reports**, and **appointments**.
- One **business permit** is owned by one **resident** and can have one or more **payments**.
- One **user** account has one role and creates many **activity logs**.

> 📌 Add your ERD image here: `![ERD](erd.png)`

---

## 👤 User Roles and Access

| Role | Data Access |
|---|---|
| **Resident / Constituent** | Own profile · Own document requests · Own blotter reports · Announcements · Own appointments |
| **Barangay Staff / Secretary** | Add and update resident records · Process document requests · Manage blotter entries and case logs · Generate reports |
| **Barangay Captain / Officials** (Kapitan, Kagawad) | View reports and statistics · Approve business permits · Post announcements and alerts · Review activity logs |
| **System Administrator** *(optional)* | Manage user accounts and access levels · Backups and security · Configure fees and forms |

Access is enforced through **role-based access control (RBAC)**.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Database** | MySQL or PostgreSQL |
| **Design Tools** | dbdiagram.io / draw.io (ERD) |
| **Version Control** | Git / GitHub |

---

## 👨‍💻 Team Members

- Lee, Sungjoon
- Era, Jedric Aldwin
- Culajara, Jake Anthony

---

<p align="center">Built to make barangay records more organized, accurate, and accessible. 🇵🇭</p>
