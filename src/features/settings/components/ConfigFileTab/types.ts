export type ConfigFileId = "config" | "guide";
export type ConfigFileDefinition = {
  id: ConfigFileId;
  name: string;
  path: string;
  badge: string;
  language: "JSON" | "Markdown";
  content: string;
  generated: boolean;
};
