import type { CollectionSchema, RolePermissions } from "deepspace/schema";

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
      {
        name: "timezone",
        storage: "text",
        interpretation: "plain",
        default: "UTC",
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
    ],
    permissions: own(true, ["timezone", "responseMode"]),
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
