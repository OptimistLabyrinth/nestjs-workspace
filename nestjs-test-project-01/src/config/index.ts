import { namespace as appConfigNamespace } from './app.config';
import { namespace as postgresNamespace } from './database/postgres.config';

// ========== ========== ========== ========== ==========

export const namespaces = {
  appConfigNamespace,
  postgresNamespace,
};

export { appConfigNamespace, postgresNamespace };

export { default as postgresConfig } from './database/postgres.config';
export { default as appConfig } from './app.config';
