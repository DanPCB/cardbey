// apps/core/cardbey-core/src/development/github/GitHubApp.ts

import { GitHubClient } from './GitHubClient';

export interface GitHubAppConfig {
  appId: string;
  installationId: string;
  privateKey: string;
  owner: string;
  repo: string;
}

export class GitHubApp {
  private client: GitHubClient;
  private owner: string;
  private repo: string;

  constructor(config: GitHubAppConfig) {
    // In production, use a JWT-based token from the app
    // For now, we use a personal access token for simplicity
    // const token = this.generateToken(config);
    const token = process.env.GITHUB_TOKEN || '';
    
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    this.client = new GitHubClient(token, config.owner, config.repo);
    this.owner = config.owner;
    this.repo = config.repo;
  }

  async createBranch(branch: string, baseBranch: string = 'main'): Promise<void> {
    return this.client.createBranch(branch, baseBranch);
  }

  async createCommit(
    branch: string,
    message: string,
    files: Array<{ path: string; content: string; mode?: '100644' | '100755' | '040000' | '160000' | '120000' }>
  ): Promise<string> {
    return this.client.createCommit(branch, message, files);
  }

  async createPullRequest(options: {
    title: string;
    body: string;
    head: string;
    base: string;
    reviewers?: string[];
    labels?: string[];
  }): Promise<{ number: number; url: string }> {
    const pr = await this.client.createPullRequest(options);
    return { number: pr.number, url: pr.url };
  }

  async getPullRequest(number: number) {
    return this.client.getPullRequest(number);
  }

  async mergePullRequest(number: number, commitTitle?: string): Promise<void> {
    return this.client.mergePullRequest(number, commitTitle);
  }

  async getCheckRuns(commitSha: string) {
    return this.client.getCheckRuns(commitSha);
  }
}