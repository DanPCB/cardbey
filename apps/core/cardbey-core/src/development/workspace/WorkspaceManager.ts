// apps/core/cardbey-core/src/development/workspace/WorkspaceManager.ts

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { CommandPolicy, CommandPolicyValidator } from './CommandPolicy';
import { DevelopmentWorkspace } from '../types/DevelopmentWorkspace';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export interface WorkspaceOptions {
  repository: string;
  branch: string;
  baseBranch: string;
  missionId: string;
}

export class WorkspaceManager {
  private workspaces: Map<string, DevelopmentWorkspace> = new Map();
  private policyValidator: CommandPolicyValidator;

  constructor(policy?: Partial<CommandPolicy>) {
    this.policyValidator = new CommandPolicyValidator(policy);
  }

  async prepareWorkspace(options: WorkspaceOptions): Promise<DevelopmentWorkspace> {
    const workspaceId = `ws-${uuidv4().slice(0, 8)}`;
    const workspacePath = `/tmp/development/${workspaceId}`;

    // Validate repository
    const repoValidation = this.policyValidator.validatePath(options.repository);
    if (!repoValidation.valid) {
      throw new Error(`Repository validation failed: ${repoValidation.reason}`);
    }

    // Create workspace directory
    await fs.mkdir(workspacePath, { recursive: true });

    // Clone repository
    const cloneCommand = `git clone ${options.repository} ${workspacePath}`;
    await this.executeCommand(cloneCommand, workspacePath);

    // Create branch
    const branchCommand = `git checkout -b ${options.branch}`;
    await this.executeCommand(branchCommand, workspacePath);

    // Install dependencies
    await this.executeCommand('npm install', workspacePath);

    const workspace: DevelopmentWorkspace = {
      id: workspaceId,
      missionId: options.missionId,
      path: workspacePath,
      repository: options.repository,
      branch: options.branch,
      status: 'READY',
      createdAt: new Date(),
      preparedAt: new Date()
    };

    this.workspaces.set(workspaceId, workspace);
    return workspace;
  }

  async executeCommand(
    command: string,
    cwd?: string,
    timeout: number = 600000 // 10 minutes default
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Validate command
    const validation = this.policyValidator.validateCommand(command);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.reason}`);
    }

    console.log(`[Workspace] Executing: ${command}`);

    return new Promise((resolve, reject) => {
      const parts = command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);

      const child = spawn(cmd, args, {
        cwd: cwd || undefined,
        shell: true,
        timeout,
        maxBuffer: 1024 * 1024 * 10 // 10MB
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        console.log(`[Workspace] stdout: ${data.toString().slice(0, 200)}...`);
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        console.error(`[Workspace] stderr: ${data.toString().slice(0, 200)}...`);
      });

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  async getFileContent(workspaceId: string, filePath: string): Promise<string> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const fullPath = `${workspace.path}/${filePath}`;
    const pathValidation = this.policyValidator.validatePath(fullPath);
    if (!pathValidation.valid) {
      throw new Error(`Path validation failed: ${pathValidation.reason}`);
    }

    return await fs.readFile(fullPath, 'utf-8');
  }

  async writeFileContent(
    workspaceId: string,
    filePath: string,
    content: string
  ): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const fullPath = `${workspace.path}/${filePath}`;
    const pathValidation = this.policyValidator.validatePath(fullPath);
    if (!pathValidation.valid) {
      throw new Error(`Path validation failed: ${pathValidation.reason}`);
    }

    // Create directory if it doesn't exist
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await fs.mkdir(dirPath, { recursive: true });

    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async listFiles(workspaceId: string, dirPath: string = ''): Promise<string[]> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const fullPath = `${workspace.path}/${dirPath}`;
    const pathValidation = this.policyValidator.validatePath(fullPath);
    if (!pathValidation.valid) {
      throw new Error(`Path validation failed: ${pathValidation.reason}`);
    }

    const files = await fs.readdir(fullPath);
    return files;
  }

  async getGitDiff(workspaceId: string): Promise<string> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const result = await this.executeCommand('git diff', workspace.path);
    return result.stdout;
  }

  async getGitStatus(workspaceId: string): Promise<string> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const result = await this.executeCommand('git status', workspace.path);
    return result.stdout;
  }

  async commitChanges(
    workspaceId: string,
    message: string
  ): Promise<string> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    await this.executeCommand('git add .', workspace.path);
    const result = await this.executeCommand(`git commit -m "${message}"`, workspace.path);
    
    // Get commit hash
    const hashResult = await this.executeCommand('git rev-parse HEAD', workspace.path);
    return hashResult.stdout.trim();
  }

  async pushChanges(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    await this.executeCommand(`git push origin ${workspace.branch}`, workspace.path);
  }

  async cleanupWorkspace(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Remove workspace directory
    await fs.rm(workspace.path, { recursive: true, force: true });

    workspace.status = 'CLEANED';
    workspace.cleanedAt = new Date();
    this.workspaces.set(workspaceId, workspace);
  }

  getWorkspace(workspaceId: string): DevelopmentWorkspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  getPolicy(): CommandPolicy {
    return this.policyValidator.getPolicy();
  }
}