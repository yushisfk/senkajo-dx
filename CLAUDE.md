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

- `docs/20_design/ORDER_SHIPPING_V2_DATA_MODEL.md` - business data model of 統合受注管理V2 and 出荷管理V2 (v0.2, 2026-10-09)

The business specs of なす仕切り管理V2, いちご製造計画V2 and いちご受託加工管理V2 live in `BASIC_ARCHITECTURE.md` (v0.5).

Draft or review files from ChatGPT (e.g. under `local-data/`) are NOT formal documents until they are synced into the files above.

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

### V2 app composition (business separation confirmed; physical kintone app count is technical design)

- 商品マスタV2 (common)
- 顧客マスタV2 / 出荷先マスタV2 / 生産者マスタV2 (common)
- 統合受注管理V2 (common)
- なす仕切り管理V2 (nasu only)
- いちご製造計画V2 (strawberry only)
- いちご受託加工管理V2 (strawberry only; contains the SF買取仕切り function)
- 在庫管理V2 (common business base for nasu and strawberry)
- 出荷管理V2 (common app; records and screens are per item)

External: 苺流通システム (producers' weekly entries and allocation to the SF 選果場; not replaced) and FLAM.
The old single "仕切り管理V2" was split on 2026-10-09.

Large monitor views and tablet screens are UI, not separate databases.

### V2-wide principles (confirmed)

- Default values are set automatically from masters/rules and saved as snapshots on the record. People edit only exceptions.
- Link to masters by ID; keep names as snapshots.
- Do not stop field operations because of system inconsistencies.
  - Stock shortage, missing Lot, missing 送り状番号 etc. raise a warning; the user records an exception reason and continues.
  - Only operations that would create duplicate IDs, destroy data or make records unidentifiable are strictly blocked.
- Quantity units are a per-product attribute: なす = cases (c/s), いちご = packs (P).
  - Strawberry 230g-equivalent packs are used ONLY for allocation and fairness comparison between producers.

### 統合受注管理V2 (integrated order management)

- 選果場 orders and 産直 orders are integrated into one V2 app.
  - They are currently split into 受注管理（選果場出荷物） and 受注管理（産直出荷物）.
- Record granularity (confirmed): 1 record = 1 受注明細.
  - Lines with the same 得意先 x 出荷先 x 出荷予定日 x 納品日 x 商品 x 出荷区分 are merged (quantity added).
  - This combination is NOT a unique key. Use the immutable, auto-numbered 受注明細ID.
- 出荷区分 (選果場出荷 / 産直出荷, confirmed) is held per order line.
  - Keep the value "産直出荷". ChatGPT drafts may write "産地出荷"; treat it as the same value and do not rename.
  - It is NOT fixed per 出荷先. The same 出荷先 can have both kinds.
  - Never infer it from the product name or the product-name prefix number.
  - Default comes from a 出荷先 x 商品 rule. The rule management UI is not finalized.
- The old 産直 "発注" function is abolished. Do not port views or graphs that filter on 発注.
- "追加" is not a status. It is a change of the ordered quantity.
- Status values (confirmed): 受注状態 = 有効 / キャンセル, 出荷状態 = 未出荷 / 出荷済.
- Cancellation keeps the original quantity. Never set it to 0. Do not delete real orders.
- Important changes are kept as 受注変更履歴 (not only kintone's built-in history). The implementation method is not finalized.
- The old mixed 出荷 field (未出荷/出荷済/キャンセル/追加) is not carried over to V2.
- Samples are out of scope of the normal order flow in the initial version.
- 産直出荷 is handled entirely in 統合受注管理V2: a person registers 出荷済 manually. It creates NO 出荷管理V2 record and NO inventory event.
- The same order must not be registered or counted twice via 苺流通システム and another route.

### 出荷管理V2 (shipping management)

- Order management and shipping management are separate apps.
- 送り状番号, 物流業者, 出荷Lot, actual shipment lines, and 出荷完了 belong to shipping management.
- Never require people to enter the same information into both order and shipping management.
  - Carry order data over automatically.
- Scope: 選果場出荷 only. Common app for nasu and strawberry; records and screens are per item.
- Record granularity (confirmed): 1 record = 1 physical shipment, identified by 出荷ID.
  - A planned-shipment record is auto-created when a 選果場出荷 order is registered.
  - Default grouping candidate: 出荷日 x 納品日 x 出荷先 x 得意先 x 発送元 x 品目. This is NOT a unique key; the final rule is technical design.
- Never mix なす and いちご in the same truck/送り状/shipment record (confirmed).
- Status: 未出荷 / 出荷完了 only.
- 代表送り状番号: at most one per physical shipment (Yamato: the lowest number; others may be empty).
  - The old rule "one number even for 10 parcels" was corrected on 2026-10-08.
- Actual shipment lines are generated from order lines. AB混合/BC混合 are split into allowed physical products; inventory is reduced by the actual shipped product.
- The known 6-digit 出荷Lot format is current nasu practice. Do not impose it on strawberry; strawberry Lot format/input is to be investigated.
- One actual shipment line may have multiple 出荷Lot. Per-Lot quantities are allocated by FIFO automatically (strawberry: by pack date within the same producer and SKU).
- After 出荷完了, record errors may be corrected only with change history and a stock difference adjustment. No silent overwrite, no double issue.
  - Real returns / reshipments are recorded as 出荷後例外 plus stock adjustment when needed (initial version).

### Large monitor (選果場モニター)

- It does NOT display order lines as they are.
- It shows "本日、選果場でどの規格がどれだけ必要か": required quantity per grade/spec.
- Target items for now: なす (cases) and いちご (packs, per customer and grade), on completely separate screens.
  - Strawberry orders are already in packs. Do NOT convert cases to packs.
  - Strawberry target = 苺流通システム allocation to the SF 選果場 (Allied) + 選果場出荷 orders of other customers, without double counting.
- The V2 monitor is used from the system migration date T. Before T, paper.
  - Old-app orders are not migrated and therefore not on the V2 monitor. How the field covers them between T and their completion is an UNDECIDED operational item to resolve before go-live. Do not decide it on your own.
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

### いちご (strawberry) production and contract processing

- いちご製造計画V2: weekly target per customer SKU (packs). Producer-level SF purchase targets are allocated by the ratio of 苺流通システム allocations to the SF 選果場 (230g-equivalent). Targets are guides, not caps.
- Which customer SKU each producer makes is decided by the 選果場 by quality. Never fix producer x customer combinations in the system.
- いちご受託加工管理V2: all finished SKUs count as contract-processing quantity. Only SKUs with 加工後取扱区分 = SF買取 generate purchase candidates; SF inventory increases only after a person confirms the purchase.
- 生産者返却 SKUs never enter SF inventory. Do not track their handover date or unreturned quantity.
- Processing fees and amounts are out of scope (FLAM etc.).

### Inventory

- Initial inventory events: 入庫 (なす仕切り確定 / いちご買取確定) / 出荷 / 在庫調整.
- A shipment reduces stock only for actual physical SKUs judged as SF-owned inventory targets by the product master etc. A 選果場出荷 is not always an inventory target; 出荷完了 and the order's 出荷済 update still work normally for non-target SKUs.
- Common inventory base for nasu and strawberry; axes and units differ per item. Physical app count is technical design.
- Strict repacking or conversion history is not required in the initial version. Handle it with 在庫調整.
- 産直出荷 is outside 選果場 inventory.
- Finished-goods inventory: physical SKU x actual date x 日付Lot, quantity in cases. Different case counts (e.g. A長80本入 / A長70本入) are different SKUs.
- Leftover (半端) inventory: grade (規格) x actual date x 日付Lot, quantity in pieces (本数). It is FIFO too; never aggregate by grade alone and lose the date.
- The producer number is not an inventory axis. On repacking, carry over the oldest actual date and 日付Lot.
- Strawberry SF inventory: producer x physical SKU x pack date, quantity in packs, FIFO. Only SF-purchased goods. No per-customer ownership or exclusive allocation.
- C品 inventory is in cases. C品 shikiri quantity in なす仕切り管理V2 is kg (confirmed 2026-10-09).
- なす仕切り管理V2: 1 record = one sorting work session of a producer. A/B in pieces; work quantity = finished cases in pieces + ending leftover - carried-over starting leftover.
- Do not guess product-specific values (case counts, packs per case, parcel rules). They come from the product master design.

### Migration (confirmed 2026-10-09)

- Old orders and shipments are migrated 0 records, including unshipped ones. Old orders are completed in the old apps. No double entry of new orders.
- なす and いちご switch on the same system migration date T.
- The official inventory start date S is a separate management start date from T, set when all old unshipped orders are completed and the stocktake/correction is done (S >= T; they are not required to be different calendar days). V2 stock between T and S is provisional.
- At S, register correct balances per confirmed inventory axis (nasu finished: SKU x date x 日付Lot; nasu leftover: grade x date x 日付Lot; strawberry: producer x SKU x pack date), with history. Not product totals.

### FLAM

- Sales management is done in FLAM.
  - Today, orders are entered in kintone and then re-entered in FLAM (double entry).
- Never design kintone products as 1:1 with FLAM product codes.
- Generating FLAM import data from V2 is a future consideration.
  - The concrete integration spec is undecided. Do not design or implement it unless instructed.
  - Direction only: convert by 販売商品 x 得意先 x 納品日; nasu price periods as effective-period rules (no hard-coded dates). Missing/ambiguous FLAM mapping stops only the FLAM export, never shipping.

### Source of truth (V2, direction)

| Information | Source of truth |
|---|---|
| Planned orders (all customers), 産直出荷 shipped status | 統合受注管理V2 |
| Nasu shikiri results | なす仕切り管理V2 |
| Strawberry weekly targets, producer purchase targets | いちご製造計画V2 |
| Strawberry processing results, SF purchase confirmation | いちご受託加工管理V2 |
| 選果場出荷 actual shipment, 送り状番号, Lot, completion | 出荷管理V2 |
| SF-owned inventory movement history (official from S) | 在庫管理V2 |
| Producer weekly entries, allocation to SF 選果場 | 苺流通システム (external) |
| Product attributes and conversion rules | 商品マスタV2 |
| Monitor | Derived information |
| Sales management, revenue, aggregation | FLAM |

## Important

Files under local-data/ may contain operational data.
Do not commit local-data/ to Git.

Do not change established business rules solely for implementation convenience.

Do not change the existing production kintone apps unless explicitly instructed.
