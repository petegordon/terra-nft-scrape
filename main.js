import { getNFTs } from './tx_nft.mjs';
import * as fs from 'fs';

/**
 * Command line program showing scraping NFTs from a terra wallet_addr
 * 
 * use:
 * 
 * node main [TERRA_WALLET_ADDRESS]
 */
let processing_start_datetime = new Date().toISOString()
let wallet_addr = process.argv[2]

//let default_options = { save_files: true, ouput_dir: '.'}
getNFTs(wallet_addr, { save_files: true, output_dir: 'nft_images_' + wallet_addr }, (nft) => {
    //called for each NFT as they are dsicovered
    //console.log(nft);
}).then((nfts) => {
    let nft_result = {}
    nft_result.processing_start_datetime = processing_start_datetime
    nft_result.processing_end_datetime = new Date().toISOString()
    nft_result.nft_txs = nfts
    nft_result.wallet_addr = wallet_addr
    fs.writeFileSync('nft_data_' + wallet_addr + '.json', JSON.stringify(nft_result))
})
