import type { CollectionSchema, RolePermissions } from "deepspace/schema";
import {
  DEFAULT_SETTINGS_TIMEZONE,
  DEFAULT_TEMPERATURE_UNIT,
} from "../jarvis/contracts";

const none: RolePermissions = {
  read: false,
  create: false,
  update: false,
  delete: false,
};
function own(
  create: boolean,
  writableFields: string[],
): Record<string, RolePermissions> {
  const rule: RolePermissions = {
    read: "own",
    create,
    update: writableFields.length ? "own" : false,
    delete: false,
    writableFields,
  };
  return { "*": none, viewer: rule, member: rule, admin: rule };
}
const userColumn = {
  name: "userId",
  storage: "text" as const,
  interpretation: "plain",
  userBound: true,
  immutable: true,
};
export const personalSchemas: CollectionSchema[] = [
  {
    name: "music-links",
    ownerField: "userId",
    uniqueOn: ["userId", "preset"],
    columns: [
      userColumn,
      ...["preset", "label", "url"].map((name) => ({
        name,
        storage: "text" as const,
        interpretation: "plain",
      })),
      {
        name: "enabled",
        storage: "number",
        interpretation: "plain",
        default: 1,
      },
    ],
    permissions: own(true, ["preset", "label", "url", "enabled"]),
  },
  {
    name: "locations",
    ownerField: "userId",
    uniqueOn: ["userId"],
    columns: [
      userColumn,
      ...["label"].map((name) => ({
        name,
        storage: "text" as const,
        interpretation: "plain",
      })),
      ...["latitude", "longitude", "enabled"].map((name) => ({
        name,
        storage: "number" as const,
        interpretation: "plain",
      })),
    ],
    permissions: own(true, ["label", "latitude", "longitude", "enabled"]),
  },
  {
    name: "device-shortcuts",
    ownerField: "userId",
    columns: [
      userColumn,
      ...["name", "kind", "onShortcut", "offShortcut"].map((name) => ({
        name,
        storage: "text" as const,
        interpretation: "plain",
      })),
      {
        name: "enabled",
        storage: "number",
        interpretation: "plain",
        default: 1,
      },
    ],
    permissions: own(true, [
      "name",
      "kind",
      "onShortcut",
      "offShortcut",
      "enabled",
    ]),
  },
  {
    name: "memories",
    ownerField: "userId",
    columns: [
      userColumn,
      {
        name: "content",
        storage: "text",
        interpretation: "plain",
        required: true,
      },
      {
        name: "category",
        storage: "text",
        interpretation: "plain",
        default: "preference",
      },
    ],
    permissions: own(false, []),
  },
  {
    name: "reminders",
    ownerField: "userId",
    columns: [
      userColumn,
      {
        name: "title",
        storage: "text",
        interpretation: "plain",
        required: true,
      },
      {
        name: "dueAt",
        storage: "text",
        interpretation: "datetime",
        required: true,
      },
      {
        name: "timezone",
        storage: "text",
        interpretation: "plain",
        default: "UTC",
      },
      {
        name: "status",
        storage: "text",
        interpretation: { kind: "select", options: ["scheduled", "delivered"] },
        default: "scheduled",
      },
    ],
    permissions: own(false, []),
  },
  {
    name: "preferences",
    ownerField: "userId",
    uniqueOn: ["userId"],
    columns: [
      userColumn,
      { name: "liveWebSearch", storage: "number", interpretation: "boolean", default: 1 },
      { name: "proactive", storage: "text", interpretation: "plain", default: "" },
      {
        name: "timezone",
        storage: "text",
        interpretation: "plain",
        default: DEFAULT_SETTINGS_TIMEZONE,
      },
      {
        name: "responseMode",
        storage: "text",
        interpretation: {
          kind: "select",
          options: ["normal", "brief", "technical"],
        },
        default: "normal",
      },
      {
        name: "temperatureUnit",
        storage: "text",
        interpretation: {
          kind: "select",
          options: ["fahrenheit", "celsius"],
        },
        default: DEFAULT_TEMPERATURE_UNIT,
      },
    ],
    permissions: own(true, [
      "timezone",
      "responseMode",
      "temperatureUnit",
      "liveWebSearch",
      "proactive",
    ]),
  },
  {
    name: "notifications",
    ownerField: "userId",
    uniqueOn: ["reminderId"],
    columns: [
      userColumn,
      {
        name: "reminderId",
        storage: "text",
        interpretation: "plain",
        required: true,
      },
      {
        name: "title",
        storage: "text",
        interpretation: "plain",
        required: true,
      },
      {
        name: "message",
        storage: "text",
        interpretation: "plain",
        required: true,
      },
      {
        name: "read",
        storage: "number",
        interpretation: "boolean",
        default: 0,
      },
    ],
    permissions: own(false, ["read"]),
  },
];
