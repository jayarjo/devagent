export class Sanitizers {
  static sanitizeTitle(title: string): string {
    // Remove control characters and limit length
    return title
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid filename chars
      .substring(0, 100)
      .trim();
  }

  static createSafeBranchName(issueNumber: string): string {
    return `ai/issue-${issueNumber}`;
  }

  static sanitizeBranchName(branchName: string): string {
    return branchName
      .replace(/[^a-zA-Z0-9_-]/g, '-') // Replace invalid git ref characters
      .replace(/--+/g, '-') // Replace multiple dashes with single dash
      .replace(/^-|-$/g, ''); // Remove leading/trailing dashes
  }

  static escapeShellArg(arg: string): string {
    // Escape argument for shell execution
    return `"${arg.replace(/["\\]/g, '\\$&')}"`;
  }
}