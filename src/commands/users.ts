import {
  loadConfig,
  loadRepostackrc,
  removeRepostackrc,
  saveRepostackrc,
} from "../shared/config";

export async function listUsers(root: string): Promise<{ users: string[]; current: string | null }> {
  const config = await loadConfig(root);
  const current = await loadRepostackrc(root);
  const users = config.users ? Object.keys(config.users) : [];
  return { users, current };
}

export async function setUser(root: string, userName: string): Promise<void> {
  const config = await loadConfig(root);

  if (!config.users || !config.users[userName]) {
    const available = config.users ? Object.keys(config.users).join(", ") : "(none)";
    throw new Error(`Unknown user: ${userName}. Available: ${available}`);
  }

  await saveRepostackrc(root, userName);
}

export async function unsetUser(root: string): Promise<void> {
  await removeRepostackrc(root);
}
