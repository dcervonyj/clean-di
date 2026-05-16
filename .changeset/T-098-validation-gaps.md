---
"clean-di-codegen": minor
---

Four new build-time diagnostics:

- CDI-011 (warning): unused bean declared but never referenced.
- CDI-012 (error): `provide<T>(factory)` factory return type doesn't match T.
- CDI-013 (error): diamond imports bring the same bean with conflicting overrides.
- CDI-014 (error): lifecycle hook signature doesn't match expected beans/config params.
