import * as fs from 'fs';
import { LCDClient, Coin } from '@terra-money/terra.js';
import got from 'got';
import winston from 'winston';

let d = new Date();
let log_file = 'nft_log_' + d.toISOString() + '.log';
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'user-service' },
    transports: [
        //
        // - Write all logs with level `error` and below to `error.log`
        // - Write all logs with level `info` and below to `combined.log`
        //
        //new winston.transports.File({ filename: 'error.log', level: 'error' }),

        new winston.transports.File({ filename: log_file }),
    ],
});


const terra = new LCDClient({
    URL: 'https://lcd.terra.dev',
    chainID: 'columbus-5',
});

function checkTXsForNFTs(json) {

    let nfts = []
    json.txs.forEach((t) => {
        try {
            t.tx.value.msg.forEach((msg) => {
                //pull nft information from Message an Example
                /*
                    {
                        "nft": {
                                    "token_id": "188662929094946339015968925493423551274",
                                    "contract_addr": "terra12vdepstt7f45lr8gz2flf7dnwzwlft3r22nref"
                                }
                    }
                */
                let nft = null
                try {
                    if (msg.value.execute_msg.mint_nft) {
                        logger.info('found MINT execute_msg.mint_nft')
                        let info = {}
                        info.nft = msg.value.execute_msg.mint_nft.mint_request.mint_metadata
                        nft = info
                        nft.mint = true

                    }
                } catch (ex) {
                    logger.info('not MINT execute_msg.mint_nft.mint_request.mint_metadata')
                }
                try {
                    if (msg.value.execute_msg.post_order.order.order.taker_asset.info.nft) {
                        logger.info('found TAKER execute_msg.post_order.order.order.taker_asset.info.nft')
                        nft = msg.value.execute_msg.post_order.order.order.taker_asset.info
                        nft.taker = true
                    }
                } catch (ex) {
                    logger.info('not TAKER execute_msg.post_order.order.order.taker_asset')
                }

                try {
                    if (msg.value.execute_msg.execute_order.order.order.maker_asset.info.nft) {
                        logger.info('found MAKER execute_msg.execute_order.order.order.maker_asset')
                        nft = msg.value.execute_msg.execute_order.order.order.maker_asset.info
                        nft.maker = true
                    }
                } catch (ex) {
                    logger.info('not MAKER execute_msg.execute_order.order.order.maker_asset')
                }

                if (nft) {
                    nfts.push(nft)
                }
            }
            )
        } catch (ex) {
            logger.error(ex)
        }
    })

    return nfts;

}
async function processNFTs(nfts, options, callback_fn) {
    let nft_records = []
    for (const nft of nfts) {
        logger.info(nft)
        let nft_record = {}
        nft_record.original_tx_record = nft
        if (nft.nft.extension) {
            logger.info('nft.nft extension')
            let url = getNFT_URL(nft.nft)
            nft_record.ipfs_url = url
            if (options.save_files)
                await downloadAndSaveNFT(url, options.output_dir)
        } else {
            nft_record.nft_contract_query_result = await processNFTContract(nft, options)
            nft_record.ipfs_url = nft_record.nft_contract_query_result.ipfs_url
        }
        if (callback_fn)
            callback_fn(nft_record)
        nft_records.push(nft_record)
    }
    return nft_records;
}
async function processNFTContract(nft, options) {
    let nft_query = {
        nft_info: {
            token_id: nft.nft.token_id
        }
    }
    let result = await terra.wasm.contractQuery(nft.nft.contract_addr, nft_query)
    logger.info(result)
    let url = getNFT_URL(result)
    result.ipfs_url = url
    if (options.save_files)
        await downloadAndSaveNFT(url, options.output_dir)
    return result;

}
function getNFT_URL(nft_json) {
    console.log(nft_json)
    console.log(nft_json.extension.image)
    logger.info(nft_json.extension.image)
    if (nft_json.extension.hasOwnProperty('image')) {
        let file_name = nft_json.extension.image.split('//')[1]
        logger.info(file_name)
        let request_url = (file_name.startsWith('ipfs.io/ipfs/') ? 'https://' : 'https://ipfs.io/ipfs/') + file_name
        logger.info(request_url)
        return request_url
    } else {
        let img_src = nft_json.image
        logger.error('has extension but did not have image property!')
        return img_src
    }

}
async function downloadAndSaveNFT(nft_url, output_dir) {
    let image_buffer = null
    let filename = 'dataUrl_' + new Date().toISOString();
    console.log(nft_url)
    if (nft_url.startsWith('data:')) {
        image_buffer = nft_url
    } else {
        image_buffer = await got(nft_url).buffer();
        filename = nft_url.replaceAll(' ', '_')
        filename = filename.replaceAll('/', '_')
        filename = filename + (filename.endsWith('.png') ? '' : '.png')
    }
    filename = output_dir + '/' + filename

    if (!fs.existsSync(output_dir)) {
        fs.mkdirSync(output_dir);
    }
    fs.writeFileSync(filename, image_buffer)
}
async function getTXs(wallet_address, offset_id) {
    const { body } = await got('https://fcd.terra.dev/v1/txs?account=' + wallet_address + '&limit=100' + ((offset_id) ? '&offset=' + offset_id : ''));
    let json = JSON.parse(body)
    return json
}

export async function getNFTs(wallet, options, callback_fn) {


    logger.info(typeof options)
    if (typeof options != "object") {
        options = new Object()
    }
    logger.info(options)

    if (!options.hasOwnProperty('save_files')) {
        options.save_files = true
    }
    if (!options.hasOwnProperty('output_dir')) {
        options.output_dir = '.'
    }
    let nft_records = []
    let repeat = true
    let offset_id = false
    while (repeat) {

        let json = await getTXs(wallet, offset_id)
        logger.info('Wallet:' + wallet + ' Transactions starting at offset:' + offset_id)
        logger.info(json)
        if (json.next) {
            repeat = true;
            offset_id = json.next
        } else {
            repeat = false;
        }
        let nfts = checkTXsForNFTs(json)
        logger.info(JSON.stringify(nfts))
        let new_nft_records = await processNFTs(nfts, options, callback_fn)
        nft_records.push(...new_nft_records)
    }
    return nft_records;
}

