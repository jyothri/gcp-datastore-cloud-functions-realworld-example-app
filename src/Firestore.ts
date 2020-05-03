import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp(functions.config().firebase);

const db = admin.firestore();

export default { db };
// export { db };
// module.exports = {db};