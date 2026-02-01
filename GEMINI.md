# GEMINI.md

This file provides guidance to GEMINI when working with code in this repository.

## Restrictions (Require Explicit Permission)

No create, update, delete operations on:
- Any file or folder inside current project directory
- Any file or folder on the file system
- Any file or folder reachable through network
- Any table, entity, column, or database schema

No git operations:
- git add or git commit to local repository
- git push to remote repository

No command execution:
- Git commands
- NPM, NVM commands
- Any command that can affect system

## Permissions (Freely Allowed)

- Read and analyze any file or folder in current project directory
- Read and analyze all git history of current project

## Constraints

### 1. Use AskUserQuestion to clarify anything ambiguous

- if you are uncertain about the direction of tasks, use AskUserQuestion tool to make sure one hundred percent what to do

### 2. Minimize Token Usage for Print Console

minimize token consumption as much as possible for displaying results

(case 1) when prompt requests include actions such as writing to file or updating files
- on completion of each phase in middle, print out "XXX task complete" to prompt response and proceed to next phase
- when all tasks are finished, simply print out "all tasks complete" to prompt response and exit

(case 2) when prompt does not explicitly require to write or to update files
- describe concisely but encompasses all essential points what has been done through this task
