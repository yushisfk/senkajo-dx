# 選果場DX - Claude Code Instructions

## Project

This repository is for the 選果場DX project.

The system is based on kintone.

## Source documents and priority

Read these before design or implementation work:

1. `docs/00_project/PROJECT_KNOWLEDGE_BASELINE.md` - integrated baseline of business premises and design policy (highest priority)
2. `docs/00_project/BASIC_ARCHITECTURE.md` - high-level design (Part I: V2 policy / Part II: current As-Is)
3. `docs/00_project/DECISION_LOG.md` - decision history (superseded entries are annotated, not deleted)
4. `docs/10_as_is/` - As-Is records of the existing production kintone apps

Formal design documents under `docs/20_design/` detail the documents above and are kept in sync with them:

- `docs/20_design/ORDER_SHIPPING_V2_DATA_MODEL.md` - business data model of 統合受注管理V2 and 出荷管理V2 (confirmed 2026-10-08)

If documents conflict, follow the order above.

Respect the status labels in those documents ("確定" / "方向" / "第一案" / "候補" / "未確定").
Never treat a first draft, candidate, or undecided item as a confirmed specification.

## Roles

ChatGPT:
- business requirements
- business rules
- overall architecture
- business decisions on the data model
- acceptance criteria

Claude Code:
- repository investigation
- existing implementation and kintone template investigation
- technical design
- implementation planning
- implementation
- testing

Do not independently change business rules or the core data model.

If implementation requires changing a business rule or core data model,
stop and report the issue before implementation.

## Development workflow

1. Read the relevant documents under docs/.
2. Investigate the existing implementation and local reference files.
3. For major changes, use Plan Mode first.
4. Do not modify code until the plan is reviewed when instructed.
5. Keep documentation synchronized with confirmed decisions and implementation
   (DECISION_LOG.md -> BASIC_ARCHITECTURE.md etc. -> baseline if needed).

## Core architecture (V2)

### Development policy (confirmed)

- Do NOT modify the existing production kintone apps. They are in use all year round.
- Build V2 as a separate, new set of kintone apps.
- Switch production to V2 only after V2 is completed and verified.
- Use the existing apps only for As-Is investigation and historical data reference.
- Existing apps, JS, views, and graphs are sources for requirements, not code to reuse as-is.
  - The existing JS baseline is kept in `src/existing/` for reference only.
- Do not reuse old field codes in V2. Some are inconsistent between apps.
  - Example: `ラジオボタン_0` means 出荷 in one app and 発注 in another.
- Use meaningful alphanumeric field codes in V2.

### V2 app composition (first draft, not final)

- 商品マスタV2
- 顧客マスタV2
- 出荷先マスタV2
- 生産者マスタV2
- 統合受注管理V2
- 仕切り管理V2
- 出荷管理V2
- 在庫管理V2

Large monitor views and tablet screens are UI, not separate databases.

### V2-wide principles (confirmed)

- Default values are set automatically from masters/rules and saved as snapshots on the record. People edit only exceptions.
- Link to masters by ID; keep names as snapshots.
- Do not stop field operations because of system inconsistencies.
  - Stock shortage, missing Lot, missing 送り状番号 etc. raise a warning; the user records an exception reason and continues.
  - Only operations that would destroy data or make records unidentifiable are strictly blocked.

### 統合受注管理V2 (integrated order management)

- 選果場 orders and 産直 orders are integrated into one V2 app.
  - They are currently split into 受注管理（選果場出荷物） and 受注管理（産直出荷物）.
- Record granularity (confirmed): 1 record = 1 受注明細.
  - Lines with the same 得意先 x 出荷先 x 出荷予定日 x 納品日 x 商品 x 出荷区分 are merged (quantity added).
  - This combination is NOT a unique key. Use the immutable, auto-numbered 受注明細ID.
- 出荷区分 (選果場出荷 / 産直出荷, confirmed) is held per order line.
  - It is NOT fixed per 出荷先. The same 出荷先 can have both kinds.
  - Never infer it from the product name or the product-name prefix number.
  - Default comes from a 出荷先 x 商品 rule. The rule management UI is not finalized.
- The old 産直 "発注" function is abolished. Do not port views or graphs that filter on 発注.
- "追加" is not a status. It is a change of the ordered quantity.
- Status values (confirmed): 受注状態 = 有効 / キャンセル, 出荷状態 = 未出荷 / 出荷済.
- Cancellation keeps the original quantity. Never set it to 0. Do not delete real orders.
- Important changes are kept as 受注変更履歴 (not only kintone's built-in history). The implementation method is not finalized.
- The old mixed 出荷 field (未出荷/出荷済/キャンセル/追加) is not carried over to V2.
- Samples are out of scope of 統合受注管理V2.

### 出荷管理V2 (shipping management)

- Order management and shipping management are separate apps.
- 送り状番号, 物流業者, 出荷Lot, actual shipment lines, and 出荷完了 belong to shipping management.
- Never require people to enter the same information into both order and shipping management.
  - Carry order data over automatically.
- Record granularity (confirmed): 1 record = 1 physical shipment, identified by 出荷ID.
  - A planned-shipment record is auto-created when an order is registered.
  - Default grouping: 出荷日 x 納品日 x 出荷先 x 得意先 x 発送元. This is NOT a unique key.
- Status: 未出荷 / 出荷完了 only.
- 代表送り状番号: at most one per physical shipment (Yamato: the lowest number; others may be empty).
  - The old rule "one number even for 10 parcels" was corrected on 2026-10-08.
- Actual shipment lines are generated from order lines. AB混合/BC混合 are split into allowed physical products; inventory is reduced by the actual shipped product.
- One actual shipment line may have multiple 出荷Lot. Per-Lot quantities are allocated by FIFO automatically.

### Large monitor (選果場モニター)

- It does NOT display order lines as they are.
- It shows "本日、選果場でどの規格がどれだけ必要か": required quantity per grade/spec.
- Target items for now: なす (cases) and いちご (packs), on completely separate screens.
- 産直出荷 is out of scope.
- Even 選果場出荷 items may be out of scope, for example finished goods brought in from producers and shipped as-is.
  - Do not decide monitor targets by 出荷区分 alone.
  - Decide them by explicit attributes on the product master etc. Attribute names are still candidates.
- Monitor data is derived from order data. It is never entered manually and is not a source of truth.

### Product classification

- Never use the product-name prefix number (e.g. "1.", "15.") as a classification key.
  - Do not use it for DX-target, inventory, or monitor decisions.
- `senkajo_dx_target` (選果場DX対象) on the existing product master was intentionally added by the user.
  - It is not an accidental production change.
- Do not treat 商品Lot as a unique key. It is a field in the product master, not a separate master.
  - Its business meaning is not fully confirmed.

### Inventory

- Initial inventory events: 仕切入庫 / 出荷 / 在庫調整.
- Strict repacking or conversion history is not required in the initial version. Handle it with 在庫調整.
- 産直出荷 is outside 選果場 inventory.
- Finished-goods inventory: physical SKU x actual date x 日付Lot, quantity in cases. Different case counts (e.g. A長80本入 / A長70本入) are different SKUs.
- Leftover (半端) inventory: grade (規格) x actual date x 日付Lot, quantity in pieces (本数). It is FIFO too; never aggregate by grade alone and lose the date.
- The producer number is not an inventory axis. On repacking, carry over the oldest actual date and 日付Lot.
- C品 inventory is in cases. The C品 input unit in 仕切り管理V2 (currently kg) is NOT finalized. Do not change it on your own.
- Do not guess product-specific values (case counts, packs per case, parcel rules). They come from the product master design.

### FLAM

- Sales management is done in FLAM.
  - Today, orders are entered in kintone and then re-entered in FLAM (double entry).
- Never design kintone products as 1:1 with FLAM product codes.
- Generating FLAM import data from V2 is a future consideration.
  - The concrete integration spec is undecided. Do not design or implement it unless instructed.

### Source of truth (V2, direction)

| Information | Source of truth |
|---|---|
| Planned orders | 統合受注管理V2 |
| Sorting/shikiri results | 仕切り管理V2 |
| Actual shipment, 送り状番号, Lot, completion | 出荷管理V2 |
| Inventory movement history | 在庫管理V2 |
| Product attributes and conversion rules | 商品マスタV2 |
| Monitor | Derived information |
| Sales management, revenue, aggregation | FLAM |

## Important

Files under local-data/ may contain operational data.
Do not commit local-data/ to Git.

Do not change established business rules solely for implementation convenience.

Do not change the existing production kintone apps unless explicitly instructed.
