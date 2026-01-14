'use strict';

import { project } from './project.mjs';
import { func } from './function.mjs';
import { entity } from './entity.mjs';
import { analysis } from './analysis.mjs';

const help_text = `usage: cb [--version] [--help] <command> [<args>]

You can use '--help' or '-h' to get help for a specific command.

Commands available:

${project.command} - ${project.description}
${func.command} - ${func.description}
${entity.command} - ${entity.description}
${analysis.command} - ${analysis.description}
`;

// Commands that we know about.
const commands = {
  project,
  function: func,
  entity,
  analysis
};

// Help uses a single handler function to provide help for specific commands.
const handler = async (argv) => {
  // Get the command that we are providing help for.
  const command = argv._.shift();

  // Get the subcommand.
  const subcommand = argv._.shift();

  if (commands[command]) {
    if (subcommand && commands[command].commands[subcommand]) {
      if (!commands[command].command_help[subcommand]) {
        console.log(`No help available for ${command} ${subcommand}`);
      } else {
        console.log(commands[command].command_help[subcommand]);
      }
    } else {
      console.log(commands[command].help);
    }
  } else if (command) {
    console.log(`Unknown command: ${command}`);
  } else {
    console.log(help_text);
  }
};

const help = {
  command: 'help',
  description: 'Display this help message',
  handler,
  help: help_text
};

export { help };
