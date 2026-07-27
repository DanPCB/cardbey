// apps/core/cardbey-core/src/development/workspace/CommandPolicy.ts

export interface CommandPolicy {
  allowedCommands: string[];
  forbiddenCommands: string[];
  maxExecutionTime: number; // seconds
  maxMemoryMB: number;
  maxDiskMB: number;
  allowedPaths: string[];
  forbiddenPaths: string[];
}

export class CommandPolicyValidator {
  private policy: CommandPolicy;

  constructor(policy?: Partial<CommandPolicy>) {
    this.policy = {
      allowedCommands: [
        'npm install',
        'npm run lint',
        'npm run typecheck',
        'npm test',
        'npm run build',
        'git status',
        'git diff',
        'git add',
        'git commit',
        'git push',
        'npx prisma generate',
        'npx prisma migrate',
        'npx prisma db push'
      ],
      forbiddenCommands: [
        'rm -rf /',
        'sudo',
        'chmod',
        'chown',
        'systemctl',
        'service',
        'docker',
        'kubectl',
        'helm',
        'terraform',
        'cloudformation'
      ],
      maxExecutionTime: 600, // 10 minutes
      maxMemoryMB: 4096, // 4GB
      maxDiskMB: 10240, // 10GB
      allowedPaths: [
        '/tmp/development/',
        process.cwd()
      ],
      forbiddenPaths: [
        '/etc',
        '/var',
        '/root',
        '/home',
        '/opt',
        '/usr'
      ],
      ...policy
    };
  }

  validateCommand(command: string): { valid: boolean; reason?: string } {
    // Check if command is forbidden
    for (const forbidden of this.policy.forbiddenCommands) {
      if (command.includes(forbidden)) {
        return {
          valid: false,
          reason: `Command contains forbidden pattern: ${forbidden}`
        };
      }
    }

    // Check if command is allowed
    const isAllowed = this.policy.allowedCommands.some(allowed => 
      command.startsWith(allowed)
    );

    if (!isAllowed) {
      return {
        valid: false,
        reason: `Command not in allowed list: ${command}`
      };
    }

    return { valid: true };
  }

  validatePath(path: string): { valid: boolean; reason?: string } {
    // Check if path is forbidden
    for (const forbidden of this.policy.forbiddenPaths) {
      if (path.startsWith(forbidden)) {
        return {
          valid: false,
          reason: `Path contains forbidden directory: ${forbidden}`
        };
      }
    }

    // Check if path is allowed
    const isAllowed = this.policy.allowedPaths.some(allowed => 
      path.startsWith(allowed)
    );

    if (!isAllowed) {
      return {
        valid: false,
        reason: `Path not in allowed list: ${path}`
      };
    }

    return { valid: true };
  }

  getPolicy(): CommandPolicy {
    return { ...this.policy };
  }
}