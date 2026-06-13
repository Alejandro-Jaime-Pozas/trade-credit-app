/**
 * Friendly TypeScript names for API data shapes.
 *
 * Types are generated from the Django OpenAPI schema (`backend/schema.yaml` →
 * `api.generated.ts`). Import these in pages/components instead of the huge
 * generated file, e.g. `import type { Customer } from "@/lib/types"`.
 *
 * When the backend adds a new model/field, run `./scripts/sync-api-schema.sh`
 * and add a new `export type` alias here if pages need it.
 */
import type { components } from "@/lib/api.generated";

/** API entity types generated from backend OpenAPI (`backend/schema.yaml`). */
export type Customer = components["schemas"]["Customer"];
export type CustomerContact = components["schemas"]["CustomerContact"];
export type CreditCase = components["schemas"]["CreditCase"];
export type UploadDocument = components["schemas"]["UploadDocument"];

export type PatchedCustomer = components["schemas"]["PatchedCustomer"];
export type PatchedCustomerContact =
  components["schemas"]["PatchedCustomerContact"];
export type PatchedCreditCase = components["schemas"]["PatchedCreditCase"];
export type PatchedUploadDocument =
  components["schemas"]["PatchedUploadDocument"];
export type User = components["schemas"]["User"];
export type TokenObtainPair = components["schemas"]["TokenObtainPair"];
export type TokenRefresh = components["schemas"]["TokenRefresh"];
