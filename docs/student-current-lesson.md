# Current DDS lesson and independent self-training

The cadet home uses `GET /api/dds/student-workspace` with the existing Bearer session. Access is limited to `CADET`/`STUDENT`; the server derives ownership from the authenticated user. No user ID is accepted. Activities contain safe session/lesson/ticket identifiers, teacher/group names, timestamps and progress; no answers, future snapshots or exercise plans are exposed.

Self-training is independent of teacher-led lessons and previous unfinished trainings. `can_start_training` is true even when activities exist. The home always offers Choose tasks, including when the workspace endpoint is unavailable. Ticket catalog availability and authorization still apply. Repeating the same successful request ID returns the same session; a different request ID may create a new training. Both old DDS demo aliases follow this policy. Per-user locks serialize retries without blocking independent requests.

Only teacher-led lessons remain mutually exclusive for a cadet. Their starts use sorted per-user locks and reject overlapping teacher classes atomically with HTTP409 `DDS_LEARNING_IN_PROGRESS`. Existing self-training does not prevent a teacher lesson from starting. Teacher-led participation remains current until the assignment ends, even if that cadet has finished their cards. Old conflicting teacher classes are reported explicitly rather than chosen arbitrarily.

Choose tasks opens the existing ordered ticket selector inside a Base UI Dialog. Its footer stays visible; the list scrolls inside the dialog. Escape/Cancel restore focus. Closing is blocked during a pending launch. No page scroll or layout jump is used to open training. A teacher lesson starting while the dialog is open does not disable independent training.

At desktop viewport sizes (width at least1024px, height at least720px), the home fills one viewport. History/materials/advice and expanded criterion text scroll inside their bounded panels. Smaller screens retain normal document scrolling to avoid clipping controls.

History can report `ARCHIVED` for records explicitly marked with `dynamic_state.dds.archived_at`. The cadet sees these as archived test sessions, rather than successfully completed exercises. Archival retains card contents, saved results and actions. `INCOMPLETE` means the session ended before all cards were processed; this is an execution status, not an evaluation. No new score or completion result is invented.
