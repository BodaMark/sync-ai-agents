import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  checkGitignoreEnvProtection,
  compareEnvWithExample,
  fixGitignoreEnvProtection,
  generateEnvExample,
} from '../security/env-manager.js';

export interface EnvCommandOptions {
  generateExample?: boolean;
  check?: boolean;
  fixGitignore?: boolean;
  env?: string;
  example?: string;
}

export async function envCommand(options: EnvCommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const envPath = path.resolve(projectRoot, options.env || '.env');
  const examplePath = path.resolve(projectRoot, options.example || '.env.example');

  const runDefaultCheck =
    !options.generateExample && !options.check && !options.fixGitignore;

  p.intro(pc.bgCyan(pc.black(' agentsync env ')));

  let hasIssues = false;

  if (options.fixGitignore) {
    const fixResult = fixGitignoreEnvProtection(projectRoot);
    if (fixResult.updated) {
      p.log.success(
        pc.green(
          `Added ${fixResult.addedPatterns.join(', ')} (and !.env.example) to .gitignore`
        )
      );
    } else {
      p.log.info(pc.green('.gitignore already protects .env and .env.* files.'));
    }
  }

  if (options.generateExample) {
    const spinner = p.spinner();
    spinner.start('Generating .env.example from .env...');
    try {
      const result = generateEnvExample(envPath, examplePath);
      spinner.stop(
        pc.green(
          `✔ Generated ${path.relative(projectRoot, result.examplePath)} with ${result.variableCount} variable(s).`
        )
      );
    } catch (err) {
      spinner.stop(pc.red('Failed to generate .env.example'));
      p.cancel(pc.red(`✖ ${(err as Error).message}`));
      process.exit(1);
    }
  }

  if (options.check || runDefaultCheck) {
    const diff = compareEnvWithExample(envPath, examplePath);
    const reportLines: string[] = [];

    if (!diff.envExists) {
      reportLines.push(pc.yellow(`⚠ ${path.basename(envPath)} file not found.`));
      hasIssues = true;
    }
    if (!diff.exampleExists) {
      reportLines.push(
        pc.yellow(
          `⚠ ${path.basename(examplePath)} file not found. Run 'agentsync env --generate-example' to create it.`
        )
      );
      hasIssues = true;
    }

    if (diff.envExists && diff.exampleExists) {
      reportLines.push(
        `${pc.green('✔')} Matched variables: ${pc.bold(String(diff.matchedKeys.length))}`
      );

      if (diff.missingInEnv.length > 0) {
        hasIssues = true;
        reportLines.push('');
        reportLines.push(pc.red(`✖ Missing in ${path.basename(envPath)} (${diff.missingInEnv.length}):`));
        for (const key of diff.missingInEnv) {
          reportLines.push(`  ${pc.red('•')} ${pc.bold(key)}`);
        }
      }

      if (diff.undocumentedInExample.length > 0) {
        hasIssues = true;
        reportLines.push('');
        reportLines.push(
          pc.yellow(
            `⚠ Undocumented in ${path.basename(examplePath)} (${diff.undocumentedInExample.length}):`
          )
        );
        for (const key of diff.undocumentedInExample) {
          reportLines.push(`  ${pc.yellow('•')} ${pc.bold(key)}`);
        }
      }

      if (diff.missingInEnv.length === 0 && diff.undocumentedInExample.length === 0) {
        reportLines.push(pc.green('✔ .env and .env.example are completely in sync.'));
      }
    }

    p.note(reportLines.join('\n'), 'Environment Variables Check');
  }

  const gitignoreStatus = checkGitignoreEnvProtection(projectRoot);
  if (gitignoreStatus.isProtected) {
    p.log.success(pc.green('.gitignore protects .env and .env.* files.'));
  } else {
    hasIssues = true;
    p.log.warn(
      pc.yellow(
        `.gitignore is missing protection for: ${gitignoreStatus.missingPatterns.join(', ')}. Run 'agentsync env --fix-gitignore' to fix.`
      )
    );
  }

  if (hasIssues) {
    p.outro(pc.yellow('⚠ Environment check completed with warnings.'));
    process.exitCode = 1;
  } else {
    p.outro(pc.green('✔ Environment configuration is healthy and protected.'));
  }
}
