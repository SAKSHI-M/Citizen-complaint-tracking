# CivicTrack Security Specification

## 1. Data Invariants
1. **Identity Integrity**: Every complaint `reporterId` and corroboration `userId` must equal `request.auth.uid` with `request.auth.token.email_verified == true`.
2. **No Self-Assigned Roles**: Users cannot write to `/admins/{userId}` unless they are already an admin or the bootstrapped administrator (`ssslmadhystha@gmail.com`).
3. **PII Isolation**: Citizen emails and private ward preferences are isolated to `/users/{userId}/private/profile` with strict owner-only read/write.
4. **Atomic Corroborations**: Creating `/complaints/{complaintId}/corroborations/{userId}` MUST occur in the same atomic batch that increments `corroborationCount` by exactly `+1` on the parent complaint.
5. **Lifecycle & Terminal Locking**: Standard citizens may only edit `title`, `description`, `locationLabel`, `ward`, `severity`, `safetyImpact`, `affectedScope`, `priorityScore`, `priorityTier`, `slaTargetHours`, `updatedAt` on their own complaint while `status == 'Submitted'`. Once `status == 'Closed'`, only an Admin/Dispatcher can reopen or modify the record.
6. **Temporal Integrity**: `createdAt` and `updatedAt` are strictly checked against `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Spoofed Reporter**: Creating a complaint with `reporterId: "other-user-uid"` instead of `request.auth.uid`. -> `PERMISSION_DENIED`
2. **Unverified Email Write**: Creating a complaint when `request.auth.token.email_verified == false`. -> `PERMISSION_DENIED`
3. **Shadow Field Injection**: Creating a complaint with an extra ghost key `isApproved: true`. -> `PERMISSION_DENIED`
4. **Initial Status Bypass**: Creating a complaint with `status: "Resolved"` or `corroborationCount: 500`. -> `PERMISSION_DENIED`
5. **Backdated Timestamp**: Creating a complaint with `createdAt` set to a client-chosen past timestamp (`!= request.time`). -> `PERMISSION_DENIED`
6. **Self-Promotion to Admin**: Writing a document to `/admins/{myUid}` as a non-admin citizen. -> `PERMISSION_DENIED`
7. **Unbounded ID Poisoning**: Creating `/complaints/aaaa...1500chars` (`!isValidId(complaintId)`). -> `PERMISSION_DENIED`
8. **Cross-User PII Read**: Reading `/users/{otherUid}/private/profile` as a non-owner. -> `PERMISSION_DENIED`
9. **Non-Atomic Counter Inflation**: Updating `corroborationCount` on `/complaints/{id}` without creating `/corroborations/{uid}` in the same batch. -> `PERMISSION_DENIED`
10. **Double-Jump Counter Inflation**: Updating `corroborationCount` by `+10` during corroboration. -> `PERMISSION_DENIED`
11. **Citizen Status Hijack**: A non-admin reporter updating `status` to `"Closed"` or changing `assignedDepartment`. -> `PERMISSION_DENIED`
12. **Terminal State Tampering**: Attempting to corroborate or edit a complaint whose `status == "Closed"` as a regular citizen. -> `PERMISSION_DENIED`

## 3. Rules Verification Plan
All 12 adversarial payloads are validated via static boundary rules (`isValidComplaint`, `isValidCorroboration`, `isValidResolutionUpdate`, `isValidPrivateProfile`, `isValidAdmin`), `affectedKeys().hasOnly(...)`, `existsAfter` / `getAfter` atomic invariants, and `@firebase/eslint-plugin-security-rules`.
