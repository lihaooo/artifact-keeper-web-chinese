export const SCOPES = [
  { value: "read", label: "读取" },
  { value: "write", label: "写入" },
  { value: "delete", label: "删除" },
  { value: "admin", label: "管理" },
] as const;

export const EXPIRY_OPTIONS = [
  { value: "30", label: "30天" },
  { value: "60", label: "60天" },
  { value: "90", label: "90天" },
  { value: "180", label: "180天" },
  { value: "365", label: "1年" },
  { value: "0", label: "永不过期" },
] as const;
