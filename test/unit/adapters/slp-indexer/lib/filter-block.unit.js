/*
  Unit tests for the filter-block.js library
*/

const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')

const MockLevel = require('../../../../unit/mocks/leveldb-mock')
const mockDataLib = require('../../../../unit/mocks/filter-block-mock')
const Cache = require('../../../../../src/adapters/slp-indexer/lib/cache')
const Transaction = require('../../../../../src/adapters/slp-indexer/lib/transaction')
const FilterBlock = require('../../../../../src/adapters/slp-indexer/lib/filter-block')

describe('#filter-block.js', () => {
  let uut, sandbox, mockData

  beforeEach(() => {
    // Restore the sandbox before each test.
    sandbox = sinon.createSandbox()

    mockData = cloneDeep(mockDataLib)

    // Mock txDb and force mock to return error.
    const txDb = new MockLevel()
    txDb.get = () => {
      throw new Error('not in db')
    }

    const cache = new Cache({ txDb })
    const transaction = new Transaction()

    uut = new FilterBlock({ cache, transaction })
  })

  afterEach(() => sandbox.restore())

  describe('#constructor', () => {
    it('should throw error if cache lib is not passed', () => {
      try {
        uut = new FilterBlock()

        assert.fail('Unexpected code path')
      } catch (err) {
        assert.equal(err.message, 'Must include instance of tx cache when instantiating filter-block.js')
      }
    })

    it('should throw error if transaction lib is not passed', () => {
      try {
        const txDb = new MockLevel()
        const cache = new Cache({ txDb })

        uut = new FilterBlock({ cache })

        assert.fail('Unexpected code path')
      } catch (err) {
        assert.equal(err.message, 'Must include instance of transaction lib when instantiating filter-block.js')
      }
    })
  })

  describe('#filterSlpTxs', () => {
    it('should filter SLP txs from block', async () => {
      // From block 652,276
      const txs = [
        '5d7001c04bfb21a3d45bb084269ce811bf11269bc020eb4146440ebd66057d4a',
        '01b2118775d84a48dec3d31c760fddd8abc44dad6073b26f72d57fbc636d912d',
        '38d5f98dbe7ff2f0205c1a370d5d587d8d98aa65ad60d7026e381e7ba559d5d0',
        'a0b18e78d60b8ead3a5c45a00a964d04c2a8c268d62043fccc644b0efdcf5dd8',
        'e05035a3719559fa4627016fd1edb2cc490092c906a3415394a16b0d0add8178'
      ]

      // The first 4 blocks are not SLP. The 5th is.
      sandbox.stub(uut.transaction, 'getTokenInfo')
        .onCall(0).resolves(false)
        .onCall(1).resolves(false)
        .onCall(2).resolves(false)
        .onCall(3).resolves(false)
        .onCall(4).resolves(true)

      const slpTxs = await uut.filterSlpTxs(txs)
      // console.log(slpTxs)

      assert.isArray(slpTxs)
      assert.equal(slpTxs.length, 1)
      assert.equal(slpTxs[0], txs[4])
    })

    it('should catch and throw errors', async () => {
      try {
        // From block 652,276
        const txs = [
          '5d7001c04bfb21a3d45bb084269ce811bf11269bc020eb4146440ebd66057d4a',
          '01b2118775d84a48dec3d31c760fddd8abc44dad6073b26f72d57fbc636d912d',
          '38d5f98dbe7ff2f0205c1a370d5d587d8d98aa65ad60d7026e381e7ba559d5d0',
          'a0b18e78d60b8ead3a5c45a00a964d04c2a8c268d62043fccc644b0efdcf5dd8',
          'e05035a3719559fa4627016fd1edb2cc490092c906a3415394a16b0d0add8178'
        ]

        // Force an error
        sandbox.stub(uut.transaction, 'getTokenInfo').rejects(new Error('test error'))

        await uut.filterSlpTxs(txs)

        assert.fail('Unexpected code path')
      } catch (err) {
        assert.equal(err.message, 'test error')
      }
    })
  })

  describe('#checkForParent2', () => {
    it('should return 2-tx DAG', async () => {
      // Mock dependencies
      sandbox.stub(uut.cache, 'get')
        .onCall(0).resolves(mockData.twoTxDag01)
        .onCall(1).resolves(mockData.twoTxDag02)
        .onCall(2).resolves(mockData.twoTxDag02)
        .onCall(3).resolves(mockData.twoTxDag03)

      const txid = 'e5ff3083cd2dcf87a40a4a4a478349a394c1a1eeffe4857c2a173b183fdd42a2'

      const result = await uut.checkForParent2(txid, 543413)
      // console.log('result: ', result)

      assert.equal(result.hasParent, true)
      assert.equal(result.dag.length, 2)
    })

    it('should catch and throw errors', async () => {
      try {
        // Force error
        sandbox.stub(uut.cache, 'get').rejects(new Error('test error'))

        const txid = 'e5ff3083cd2dcf87a40a4a4a478349a394c1a1eeffe4857c2a173b183fdd42a2'

        await uut.checkForParent2(txid, 543413)

        assert.fail('Unexpected code path')
      } catch (err) {
        assert.equal(err.message, 'test error')
      }
    })
  })

  describe('#forwardDag', () => {
    it('should add forward TXID to DAG', async () => {
      // force cache to get data from the full node.
      sandbox.stub(uut.cache.txDb, 'get').rejects(new Error('no entry'))

      // Mock dependencies
      sandbox.stub(uut.cache, 'get')
        .onCall(0).resolves(mockData.forwardDagTx01)
        .onCall(1).resolves(mockData.forwardDagTx02)
        .onCall(2).resolves(mockData.forwardDagTx03)
        .onCall(3).resolves(mockData.forwardDagTx02)

      const chainedArray = [
        '170147548aad6de7c1df686c56e4846e0936c4573411b604a18d0ec76482dde2',
        'e5ff3083cd2dcf87a40a4a4a478349a394c1a1eeffe4857c2a173b183fdd42a2',
        'f56121d5a21a319204cf26ce68a6d607fefa02ba6ac42b4647fcad813b32d8b3',
        '660057b446cc4c930493607aa02e943e4fe7c38ae0816797ff7234ba72fea50f'
      ]
      const unsortedArray = [
        '234893177b18a95dbfc1eb855d69f1c9cc256a317a6c51be8fd1b9a38ae072ce',
        '82a9c47118dd221bf528e8b9ee9daef626ca52fb824b92cbe52a83e87afb0fac',
        '483d0198ed272bd0be7c6bbaf0e60340cce926f7d32143e2b09c5513922eaf87'
      ]

      const result = await uut.forwardDag(chainedArray, unsortedArray)
      // console.log('result: ', result)

      assert.equal(result.success, true)
      assert.equal(result.chainedArray.length, 5)
      assert.equal(result.unsortedArray.length, 2)
    })
  })
})
