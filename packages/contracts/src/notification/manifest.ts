import { defineModule } from '../module.js';

// In-app notices have no permissions of their own: every signed-in user sees exactly their own.
export const notification = defineModule({
  name: 'notification',
  deps: ['core'],
  permissions: {},
  nav: [],
  events: [],
});
