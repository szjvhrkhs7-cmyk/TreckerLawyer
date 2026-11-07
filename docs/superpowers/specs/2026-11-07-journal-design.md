# Lawyer tracker journal redesign
Approved in conversation: implement the three-screen reference, then perform a separate QA phase.

- Priorities: compact weekly calendar expandable to a correct month grid, selected-day list, existing/new task scheduling, red main-task stars, pointer/keyboard reorder and explicit date move. Plan dates stay independent of deadlines.
- Tasks: unified root/legacy-project task list, status filters, create/edit/complete/reopen, one-level editable subtasks persisted within parent records. Completing a parent with open children requires confirmation. Subtask completion never silently completes a parent.
- Settings: real cloud account status, login, enable/pause synchronization without losing local data, last successful sync, manual retry, existing backup export/restore.
- Warm light surfaces, orange actions, readable system sans serif, frosted floating three-item bottom navigation; desktop uses the same navigation and a centered wider layout. Preserve dark preference with an accessible dark palette.
- Preserve all storage keys, legacy project/note/event data, backend URL, user scoping and reconciliation. No database schema changes, no real customer data in tests.
- QA: pure date/subtask tests; storage/sync regression suite; browser CRUD, calendar, subtask persistence, backup, responsive/safe area/keyboard checks; two-device simulated cloud roundtrip plus pause/offline/error cases; read-only live endpoint checks and deployed smoke check.
