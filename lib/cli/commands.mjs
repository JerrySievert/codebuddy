'use strict';

import { help, project, func, entity, analysis, reference, hierarchy } from './commands/index.mjs';

// A list of the commands for the CLI.
const commands = {
  help,
  project,
  function: func,
  entity,
  analysis,
  reference,
  hierarchy
};

const handler = async (command, argv) => {
  if (commands[command] === undefined) {
    commands.help.handler(argv);
  }

  // Get a copy of the subcommand.
  const subcommand = argv._[0];

  // Try to execute the command or subcommand, catch any errors and display a
  // message if there is an error.
  try {
    if (commands[command].commands && commands[command].commands[subcommand]) {
      argv._.shift();

      // Check the arguments, and if they are not there give the missing argument
      // error message and respond with help.
      if (commands[command].command_arguments?.[subcommand]) {
        const required_args = required_arguments(
          commands[command].command_arguments[subcommand]
        );

        const missing = argument_check(
          argv,
          commands[command].command_arguments[subcommand]
        );
        if (missing.length > 0) {
          console.error(
            `Missing or incorrect arguments: ${missing.join(', ')}\n`
          );

          // Take us back to an unmodified state so we can just call help.
          argv._.unshift(subcommand);
          argv._.unshift(command);

          // Call the help handler with the modified arguments.
          commands.help.handler(argv);

          return;
        }
      }

      // Call the subcommand.
      await commands[command].commands[subcommand](argv);
    } else if (commands[command].handler) {
      // There is no subcommand handler, so we can just call the command.
      await commands[command].handler(argv);
    } else {
      argv._.unshift(command);
      commands.help.handler(argv);
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
    //process.exit(1);
  }
};

/**
 * Returns an array with the keys of the required arguments
 * for a given sub‑command.
 *
 * @param {string} command - The name of the sub‑command (e.g. "import").
 * @param {object} args - An object containing the arguments (e.g. ["--path", "--name"]).
 * @returns {string[]} Array of required argument keys.
 */
function required_arguments(args) {
  if (!args) {
    return [];
  } // No such command in the spec.

  const req = [];
  for (const key in args) {
    if (args[key].required) {
      req.push(key);
    }
  }
  return req;
}

// Check to make sure the required arguments are present and valid.
const argument_check = (argv, expected) => {
  const required = required_arguments(expected);

  // Find any missing arguments.
  const missing = required.filter((arg) => {
    return !argv[arg] || expected[arg].type !== typeof argv[arg];
  });

  return missing;
};

export { commands, handler, argument_check };
