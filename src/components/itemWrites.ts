import type { Fields } from "./api.ts";
import type { ExpiryWrite, ValueWrite } from "./pantryState.ts";

// Where each write goes and what it carries (the endpoints take exactly one group).
export function valueRequest(itemId: string, write: ValueWrite): [string, Fields] {
  switch (write.kind) {
    case "fill":
      return [`/items/${itemId}/value`, { fillStop: String(write.stop) }];
    case "count":
      return [`/items/${itemId}/value`, { count: String(write.count) }];
    case "exact":
      return [
        `/items/${itemId}/value`,
        { exactAmount: String(write.amount), exactUnit: write.unit },
      ];
    case "clearExact":
      return [`/items/${itemId}/value`, { exactAmount: "" }];
    case "measure":
      return [`/items/${itemId}/measure`, { measure: write.measure }];
  }
}

export function expiryRequest(itemId: string, write: ExpiryWrite): [string, Fields] {
  switch (write.kind) {
    case "bucket":
      return [`/items/${itemId}/expiry`, { bucket: write.bucket, today: write.today }];
    case "date":
      return [`/items/${itemId}/expiry`, { date: write.date }];
    case "clearDate":
      return [`/items/${itemId}/expiry`, { clearDate: "1" }];
  }
}
