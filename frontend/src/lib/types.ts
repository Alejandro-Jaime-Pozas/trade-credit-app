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
