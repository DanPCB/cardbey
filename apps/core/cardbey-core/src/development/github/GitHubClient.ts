// apps/core/cardbey-core/src/development/github/GitHubClient.ts

import { Octokit } from '@octokit/rest';

export interface PullRequestOptions {
  title: string;
  body: string;
  head: string;
  base: string;
  reviewers?: string[];
  labels?: string[];
}

export interface PullRequest {
  number: number;
  url: string;
  state: 'open' | 'closed' | 'merged';
  title: string;
  body: string;
  head: string;
  base: string;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
}

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  async createBranch(branch: string, baseBranch: string): Promise<void> {
    try {
      // Get the base branch's SHA
      const { data: baseBranchData } = await this.octokit.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch: baseBranch
      });

      // Create the new branch
      await this.octokit.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branch}`,
        sha: baseBranchData.commit.sha
      });

      console.log(`✅ Branch ${branch} created from ${baseBranch}`);
    } catch (error: any) {
      throw new Error(`Failed to create branch: ${error.message}`);
    }
  }

  async createCommit(
    branch: string,
    message: string,
    files: Array<{ path: string; content: string; mode?: '100644' | '100755' | '040000' | '160000' | '120000' }>
  ): Promise<string> {
    try {
      // Get the current commit SHA of the branch
      const { data: refData } = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branch}`
      });

      const baseSha = refData.object.sha;

      // Create blobs for each file
      const blobs = await Promise.all(
        files.map(async (file) => {
          const { data: blob } = await this.octokit.git.createBlob({
            owner: this.owner,
            repo: this.repo,
            content: file.content,
            encoding: 'utf-8'
          });
          return {
            path: file.path,
            sha: blob.sha,
            mode: file.mode || '100644'
          };
        })
      );

      // Create a tree with the blobs
      const { data: tree } = await this.octokit.git.createTree({
        owner: this.owner,
        repo: this.repo,
        base_tree: baseSha,
        tree: blobs.map(blob => ({
          path: blob.path,
          sha: blob.sha,
          mode: blob.mode as any,
          type: 'blob'
        }))
      });

      // Create the commit
      const { data: commit } = await this.octokit.git.createCommit({
        owner: this.owner,
        repo: this.repo,
        message,
        tree: tree.sha,
        parents: [baseSha]
      });

      // Update the branch reference
      await this.octokit.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branch}`,
        sha: commit.sha,
        force: false
      });

      return commit.sha;
    } catch (error: any) {
      throw new Error(`Failed to create commit: ${error.message}`);
    }
  }

  async createPullRequest(options: PullRequestOptions): Promise<PullRequest> {
    try {
      const { data: pr } = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
        maintainer_can_modify: true,
        draft: false
      });

      // Add reviewers if specified
      if (options.reviewers && options.reviewers.length > 0) {
        await this.octokit.pulls.requestReviewers({
          owner: this.owner,
          repo: this.repo,
          pull_number: pr.number,
          reviewers: options.reviewers
        });
      }

      // Add labels if specified
      if (options.labels && options.labels.length > 0) {
        await this.octokit.issues.addLabels({
          owner: this.owner,
          repo: this.repo,
          issue_number: pr.number,
          labels: options.labels
        });
      }

      return {
        number: pr.number,
        url: pr.html_url,
        state: pr.state as 'open' | 'closed' | 'merged',
        title: pr.title,
        body: pr.body || '',
        head: pr.head.ref,
        base: pr.base.ref,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at || undefined
      };
    } catch (error: any) {
      throw new Error(`Failed to create pull request: ${error.message}`);
    }
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    try {
      const { data: pr } = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: number
      });

      return {
        number: pr.number,
        url: pr.html_url,
        state: pr.state as 'open' | 'closed' | 'merged',
        title: pr.title,
        body: pr.body || '',
        head: pr.head.ref,
        base: pr.base.ref,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at || undefined
      };
    } catch (error: any) {
      throw new Error(`Failed to get pull request: ${error.message}`);
    }
  }

  async mergePullRequest(
    number: number,
    commitTitle?: string,
    commitMessage?: string
  ): Promise<void> {
    try {
      await this.octokit.pulls.merge({
        owner: this.owner,
        repo: this.repo,
        pull_number: number,
        commit_title: commitTitle,
        commit_message: commitMessage,
        merge_method: 'squash'
      });
    } catch (error: any) {
      throw new Error(`Failed to merge pull request: ${error.message}`);
    }
  }

  async getCheckRuns(commitSha: string): Promise<Array<{
    name: string;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | null;
    detailsUrl?: string;
  }>> {
    try {
      const { data } = await this.octokit.checks.listForRef({
        owner: this.owner,
        repo: this.repo,
        ref: commitSha
      });

      return data.check_runs.map(run => ({
        name: run.name,
        status: run.status as 'queued' | 'in_progress' | 'completed',
        conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | null,
        detailsUrl: run.details_url || undefined
      }));
    } catch (error: any) {
      throw new Error(`Failed to get check runs: ${error.message}`);
    }
  }
}