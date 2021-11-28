/*
  A utility library for doing common tasks with respect to indexing.
  This library is primarily used by the genesis.js, mint.js, and send.js files.
*/

class IndexerUtils {
  // Generate a new schema/template for an address object. This structure will
  // be populated with data.
  getNewAddrObj () {
    const addr = {
      utxos: [],
      txs: [],
      balances: []
    }

    return addr
  }

  // Will add a new entry to an array, but only if the entry does not already
  // exist in the array.
  // Canonical use case: Adding transactions to an array
  addTxWithoutDuplicate (txObj, array) {
    try {
      // if (array.includes(entry)) return
      //
      // array.push(entry)

      const txid = txObj.txid

      const txidExists = array.filter((x) => x.txid === txid)

      // Exit if the entry already exists.
      if (txidExists.length) return

      // Add the entry if it does not exist.
      array.push(txObj)
    } catch (err) {
      console.error('Error in indexer/util.js/addTxWithoutDuplicate')
      throw err
    }
  }

  // Finds a UTXO element within an array of UTXOs. Returns a new array with
  // the targeted UTXO deleted.
  removeUtxoFromArray (utxoObj, array) {
    try {
      const newArray = array.filter(
        (x) => x.txid !== utxoObj.txid || x.vout !== utxoObj.vout
      )
      // console.log('newArray: ', newArray)

      return newArray
    } catch (err) {
      console.error('Error in removeObjFromArray()')
      throw err
    }
  }

  sleep (ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

module.exports = IndexerUtils
