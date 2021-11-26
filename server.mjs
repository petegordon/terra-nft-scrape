/**
 * Web Server application, with WebSockets showing scraping NFTs from a terra wallet_addr
 * 
 * use:
 * 
 * node server
 * 
 * Then go to localhost:8000 and enter your  [TERRA_WALLET_ADDRESS] into the user interface and watch
 * the NFT images start showing up.
 */
import * as http from 'http';
import * as fs from 'fs';
import * as websocket from 'websocket';
const WebSocketServer = websocket.server

import { getNFTs } from './tx_nft.mjs';

const host = 'localhost';
const port = 8000;
//HTTP Server index.html
const requestListener = function (req, res) {
    res.writeHead(200);
    res.end(fs.readFileSync('index.html'));
};
const server = http.createServer(requestListener);
server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});
//Websocket server on the same server
const wsServer = new WebSocketServer({
    httpServer: server
});
function startGetNFTs(wallet_addr, fn) {
    //test    let interval = setInterval(fn, 500, { "nft": "test", "hello": "world" })

    let processing_start_datetime = new Date().toISOString()
    getNFTs(wallet_addr, { save_files: false, output_dir: 'nft_images_' + wallet_addr }, (nft) => {
        fn(nft)
    }).then((nfts) => {
        let nft_result = {}
        nft_result.processing_start_datetime = processing_start_datetime
        nft_result.processing_end_datetime = new Date().toISOString()
        nft_result.nft_txs = nfts
        nft_result.wallet_addr = wallet_addr
        fs.writeFileSync('nft_data_' + wallet_addr + '.json', JSON.stringify(nft_result))
        console.log('completed nfts')
        fn({ "completed_nfts": true })
        //test clearInterval(interval)
    })
}
wsServer.on('connect', function (connection) {
    console.log('Connection Accepted')
});
wsServer.on('request', function (request) {
    console.log('Request Received')
    const connection = request.accept(null, request.origin);
    connection.on('message', function (message) {
        console.log('Received Message:', message.utf8Data);
        connection.sendUTF('Hi this is WebSocket server!');
        if (message.utf8Data.startsWith('{') || message.utf8Data.startsWith('[')) {
            let jsonData = JSON.parse(message.utf8Data)
            console.log(jsonData)
            if (jsonData.wallet_addr) {
                startGetNFTs(jsonData.wallet_addr, (nft) => {
                    connection.sendUTF(JSON.stringify(nft))
                })
            }
        }
    });
    connection.on('close', function (reasonCode, description) {
        console.log('Client has disconnected.');
    });

});