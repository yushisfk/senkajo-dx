# 選果場DX - Claude Code Instructions

## Project

This repository is for the 選果場DX project.

The system is based on kintone.

## Roles

ChatGPT:
- business requirements
- business rules
- overall architecture
- acceptance criteria

Claude Code:
- repository investigation
- technical design
- implementation planning
- implementation
- testing

Do not independently change business rules.

If implementation requires changing a business rule or core data model,
stop and report the issue before implementation.

## Development workflow

1. Read the relevant documents under docs/.
2. Investigate the existing implementation and local reference files.
3. For major changes, use Plan Mode first.
4. Do not modify code until the plan is reviewed when instructed.
5. Keep documentation synchronized with confirmed implementation.

## Core architecture

- Existing order management app remains the source of truth for orders.
- Existing product master remains in use.
- Existing shipping destination master remains in use.
- Shikiri management will be a new kintone app.
- Shipping operation will be a new kintone app.
- Inventory management will be a new kintone app.
- Large monitor views are UI, not a separate database.
- Tablet screens are UI, not a separate database.

## Important

Files under local-data/ may contain operational data.
Do not commit local-data/ to Git.

Do not change established business rules solely for implementation convenience.
