import { default as sqlite3InitModule } from '@sqlite.org/sqlite-wasm';
import { fromEvent } from 'rxjs';

sqlite3InitModule().then(async (sqlite3) => {
  var messages = fromEvent(self, 'message');

  const poolUtil = await navigator.locks.request("sah_init", async (lock) => await sqlite3.installOpfsSAHPoolVfs());
  const getTabLock = async () => {
    const { promise, resolve } = Promise.withResolvers();

    navigator.locks.request(
      "tab",
      (lock) => promise, // Now lock will be held until either resolve() or reject() is called.
    );

    return resolve;
  }

  var release = await getTabLock();
  sqlite3.initWorker1API();


  messages.subscribe(async function ({ data }) {
    if (data.args.sql == "-- LEAVING") {
      poolUtil.pauseVfs();
      release();
    }

    if (data.args.sql == "-- ARRIVING") {
      release = await getTabLock();
      poolUtil.unpauseVfs();
    }

    if (data.args.sql === "-- IMPORT THE SHIT") {
      console.log(poolUtil.importDb(data.args.bind.name, data.args.bind.byteArray));
    }
  });
});