import { existsSync } from 'node:fs';
import path from 'node:path';

const TMP_HOME = '/tmp';
const TMP_NPM_CACHE = '/tmp/.npm';
const TMP_XDG_CACHE = '/tmp/.cache';

function resolveLocalMcpCommand(): { command: string; args: string[] } | null {
  const localBin = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'playwright-mcp.cmd' : 'playwright-mcp',
  );
  if (existsSync(localBin)) {
    return { command: localBin, args: [] };
  }

  const localCli = path.join(process.cwd(), 'node_modules', '@playwright', 'mcp', 'cli.js');
  if (existsSync(localCli)) {
    return { command: process.execPath, args: [localCli] };
  }

  return null;
}

function buildSpawnEnv(): Record<string, string> {
  const env = process.env as Record<string, string>;

  return {
    ...env,
    HOME: env.HOME || TMP_HOME,
    npm_config_cache: env.npm_config_cache || TMP_NPM_CACHE,
    NPM_CONFIG_CACHE: env.NPM_CONFIG_CACHE || TMP_NPM_CACHE,
    XDG_CACHE_HOME: env.XDG_CACHE_HOME || TMP_XDG_CACHE,
  };
}

export function buildPlaywrightMcpLaunchArgs(cdpEndpoint: string): {
  command: string;
  args: string[];
  env: Record<string, string>;
} {
  const endpointArgs = ['--cdp-endpoint', cdpEndpoint];
  const local = resolveLocalMcpCommand();

  if (local) {
    return {
      command: local.command,
      args: [...local.args, ...endpointArgs],
      env: buildSpawnEnv(),
    };
  }

  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return {
    command: npxCommand,
    args: ['--yes', '@playwright/mcp', ...endpointArgs],
    env: buildSpawnEnv(),
  };
}
