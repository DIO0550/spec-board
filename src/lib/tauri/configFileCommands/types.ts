export type ConfigFileId = "config" | "guide";
export type OpenConfigFileTarget = ConfigFileId | "labels";

export type ConfigFilePayload = {
  id: ConfigFileId;
  name: string;
  path: string;
  badge: string;
  language: "JSON" | "Markdown";
  content: string;
  generated: boolean;
};

export type GetConfigFilesPayload = {
  files: ConfigFilePayload[];
};

export type OpenConfigFileArgs = {
  target: OpenConfigFileTarget;
};
