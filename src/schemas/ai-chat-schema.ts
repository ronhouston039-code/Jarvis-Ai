import {
  AI_CHATS_SCHEMA,
  AI_MESSAGES_SCHEMA,
  type CollectionSchema,
} from "deepspace/schema";
const own = {
  read: "own" as const,
  create: false,
  update: false,
  delete: false,
};
const permissions = {
  "*": { read: false, create: false, update: false, delete: false },
  viewer: own,
  member: own,
  admin: own,
};
export const aiChatSchemas: CollectionSchema[] = [
  AI_CHATS_SCHEMA,
  AI_MESSAGES_SCHEMA,
].map((schema) => ({ ...schema, permissions }));
