/*
  This library is concernced with navigating the DAG of a transaction.

  All other methods have been replaced with crawlDag()
*/

class DAG {
  constructor (localConfig = {}) {
    this.cache = localConfig.cache
    if (!this.cache) {
      throw new Error('instance of cache required when instantiating DAG')
    }
    this.txDb = localConfig.txDb
    if (!this.txDb) throw new Error('TX DB required')
  }

  // This is a recursive function.
  // This function will recursively call itself, to traverse the DAG and find
  // all the parent TXs for that transaction. It will then
  // return an array of TXs, sorted with the oldest parent first, and the given
  // input tx as the last element.
  // It first queries the parent TX from LevelDB. If that TX is found, the
  // crawling stops and the validation result from the database is used. This
  // makes crawling *much* faster.
  async crawlDag (txid, tokenId, txidAry = [], endFound = null) {
    try {
      if (!txid) {
        throw new Error('txid required to crawl DAG')
      }
      if (!tokenId) {
        throw new Error('tokenId required to crawl DAG')
      }

      // console.log(`txData: ${JSON.stringify(txData, null, 2)}`)
      // console.log(`crawling TXID ${txData.txid}, cnt ${this.cnt}`)

      // Set default value for the output object.
      const outObj = {
        isValid: false,
        dag: []
      }

      const txData = await this.cache.get(txid)
      // console.log(`txData: ${JSON.stringify(txData, null, 2)}`)

      // Exit immediately if endFound achieves true or false status.
      if (endFound === true || endFound === false) {
        outObj.isValid = endFound
        outObj.dag = txidAry
        return outObj
      }

      // If the txid does not exist in the txidAry array, then add it.
      const isAlreadyAdded = txidAry.filter((x) => x === txid)
      if (!isAlreadyAdded.length) {
        // Add it to the beginning of the array.
        txidAry.unshift(txData.txid)
        // console.log(`txData: ${JSON.stringify(txData, null, 2)}`)
      }

      // Loop through each input that represents tokens.
      for (let i = 0; i < txData.vin.length; i++) {
        const thisVin = txData.vin[i]
        // console.log(`thisVin: ${JSON.stringify(thisVin, null, 2)}`)

        // Evaluate if the token IDs match.
        const sameTokenId = thisVin.tokenId === txData.tokenId

        // If the input is not colored as a token, then skip it.
        // Corner case: If a mint baton, qty is 0 but still a valid token tx.
        // Corner case: If tokenId doesn't match, then skip it.
        if ((!thisVin.tokenQty && !thisVin.isMintBaton) || !sameTokenId) {
          continue
        }

        // Phase 1: retrieve the parent TX.

        let parentTx = {}
        try {
          // Get the parent from the database
          parentTx = await this.txDb.get(thisVin.txid)
          // console.log(`parentTx from DB: ${JSON.stringify(parentTx, null, 2)}`)
        } catch (err) {
          // If DB lookup failed, retrieve the parent TX from the cache.
          parentTx = await this.cache.get(thisVin.txid)
          // console.log(`parentTx: ${JSON.stringify(parentTx, null, 2)}`)
        }

        // Phase 2: Evaluate relationship between parent and child.

        // Phase 2a: Evaluate rules that apply regardless of where parent came
        // from (cache or full node).
        if (parentTx.tokenType !== txData.tokenType) {
          // Corner case: Mixing NFT and Type 1 tokens.
          endFound = false
          outObj.dag = txidAry
          return outObj
        }

        // Phase 2b: Evaluate cached pre-evaluated parents.
        // If the parent TX is a valid SLP tx that has already been evaluated.
        if (parentTx.isValidSlp) {
          // console.log(`thisVin: ${JSON.stringify(thisVin, null, 2)}`)
          // console.log(`parentTX TXID: ${parentTx.txid}`)

          // Ensure this input is either a token or a minting baton.
          const vinIsTokenOrBaton = !!thisVin.tokenQty || thisVin.isMintBaton
          // console.log(`vinIsTokenOrBaton: ${JSON.stringify(vinIsTokenOrBaton, null, 2)}`)

          // Ensure this input originates from that parent.
          // console.log(`parentTx.vout: ${JSON.stringify(parentTx.vout, null, 2)}`)
          const parentOutMatch = parentTx.vout.filter(
            (x) => x.n === thisVin.vout && vinIsTokenOrBaton
          )
          // console.log(`parentOutMatch: ${JSON.stringify(parentOutMatch, null, 2)}`)

          if (parentOutMatch.length) {
            // Stop crawling DAG and use result from DB.
            txidAry.unshift(parentTx.txid)

            // Final parent found. Stop the recursive calls.
            endFound = true
            outObj.isValid = true
            outObj.dag = txidAry
            return outObj
          }
        } else if (parentTx.isValidSlp === false) {
          endFound = false
          outObj.dag = txidAry
          return outObj
        }

        // Phase 2c: Evaluate un-cached, un-evaluated parent

        // Not sure why or how parentTx can be undefined, but...
        // if (!parentTx) return

        if (parentTx.tokenId !== tokenId) {
          // Corner case. Outputs from one token used for input of a different token.
          throw new Error(
            `TokenID does not match. Given token ID ${tokenId} does not match token ID ${parentTx.tokenId} in parent TXID ${parentTx.txid}`
          )

          //
        } else if (parentTx.txid === tokenId) {
          // GENESIS TX Found. End of DAG.
          txidAry.unshift(parentTx.txid)

          // Final parent found. Stop the recursive calls.
          endFound = true
          outObj.isValid = true
          outObj.dag = txidAry
          return outObj

          //
        } else {
          // chainedParentsDetected = true

          // Recursively call this function to follow the DAG to the first parent
          // in this block.
          const inObj = await this.crawlDag(parentTx.txid, tokenId, txidAry, endFound)
          endFound = inObj.isValid
        }
      }

      outObj.dag = txidAry

      if (endFound === true) {
        outObj.isValid = true
        return outObj
      }

      return outObj
    } catch (err) {
      console.error('Error in crawlDag()')
      throw err
    }
  }
}

module.exports = DAG
