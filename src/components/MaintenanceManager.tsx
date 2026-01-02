import React from "react";
import { DiscordMessage, User } from "../types";

interface Props {
  onDiscordLog: (msg: DiscordMessage) => void;
  isRunning: boolean;
  currentUser: User;
}

const MaintenanceManager: React.FC<Props> = () => {
  // 暫時移除「維護模式自動化程序」區塊
  return null;
};

export default MaintenanceManager;
