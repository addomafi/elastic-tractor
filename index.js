'use strict';

let path = require('path')
const zlib = require('zlib')
let ElasticTractor = require(path.join(__dirname, '.', 'elastictractor.js'))

console.log('Loading function');

exports.handler = function(event, context, callback) {
    let tractor = new ElasticTractor();
    // If it has records
    if (event.Records) {
      _.forEach(event.Records, function(evtRecord) {
        var evtSrc = evtRecord.eventSource;
        if (evtRecord.EventSource) {
          evtSrc = evtRecord.EventSource;
        }
        switch(evtSrc) {
          case "aws:s3":
            tractor.processS3(evtRecord).then(results => {
              callback(null, "Success");
            }).catch(err => {
              console.log(`Occurred an error "${JSON.stringify(err)}" on event ${JSON.stringify(evtRecord)}`)
              callback(null, "Success");
            });
            break;
          case "aws:sns":
            tractor.processSNS(evtRecord).then(results => {
              callback(null, "Success");
            }).catch(err => {
              console.log(`Occurred an error "${JSON.stringify(err)}" on event ${JSON.stringify(evtRecord)}`)
              callback(err, "Error");
            });
            break;
          case "aws:kinesis":
            tractor.processKinesis(evtRecord).then(results => {
              callback(null, "Success");
            }).catch(err => {
              console.log(`Occurred an error "${JSON.stringify(err)}" on event ${JSON.stringify(evtRecord)}`)
              callback(err, "Error");
            });
            break;
          default:
            console.log(`Event source "${evtRecord.eventSource}" is not supported. Event: ${JSON.stringify(evtRecord)}`)
            callback(null, "Success");
        }
      })
    } else {
      // Treat as a stream of CloudWatch Logs
      var buffer = Buffer.from(event.awslogs.data, 'base64')
      zlib.unzip(buffer, (err, buffer) => {
        if (!err) {
          tractor.processAwsLog(JSON.parse(buffer.toString())).then(results => {
            callback(null, "Success");
          }).catch(err => {
            console.log(`Occurred an error "${JSON.stringify(err)}" on aws-logs ${buffer.toString()}`)
            callback(null, "Success");
          });
        } else {
          console.log(`Occurred an error "${JSON.stringify(err)}" on aws-logs ${buffer.toString()}`)
          callback(null, "Success");
        }
      });
    }
};

// exports.handler({
// 	"awslogs": {
//     "data": "H4sIAJInA1sAA4VSwW7iMBQ8w1egaI9NiU2cxNzYFqpK3a1U0j1sg5BJXqjVJI5sA0IV/762k0J399ADEZ55b954nt+HA68GpdgW0mML3nTk3c7S2frHfLmc3c29K8OLQwPSMnEcEkQCGpKAOKYS2zspdq0lx+ygxhWrNwUb56XSLH/ztxKg8VXNK1B+x/llxbev2md7xiu24RXXR18Bk/lrx6gP5aWWwGorjQOUjAMyxmj88u1hls6X6WqDoIiDiOQhRiECSnEQRtGmKCCnGG8mTkXtNiqXvNVcNAteaZDK6L14D85KN2BtrGnJci2kv8feqp8+30OjXfX7cDDweGGNTMKAoBjRiMRJksQUTzBKMKUhpbFJJopC8yMkwFGMI0xwlIQ0wAm2Zgae5iZpzWobFzIknSCKkoQQx/Zb+LivHxAfoxTRaUimKLk2Zb8zHeJwAmRS+qTAuY8QJD5NzAcKQjGKCGZhmelLE6Kj+5+Lx9Ho+/3oCVohdabfM8/e940328yblqxScGUh3toXYKDMEw0c2DHzLA71fcEMquUOuvMvUWn2uRXqp/TTuYZGyDV3Xc2uqs7Qvm/sQSVqtv4Y9XeleVRNYS1diFby3FheuE0tLH8xVTrwsYElbI2ANgw+w+lB9LAyeHAdn5mLeHd+VlC4+++anfvrcoH8VdjOFxOckHzLmxmXNsobUXRx3T09u9rCrJc3zL62f0sWN499Scuk3km4ZbpjumVHPg4y77QyJXtxHqd5K/5bCJO8ZA7NRQ0y56z65NQRLnt7rT4mHJyuvpZjByaLr6SC0+qUNd5wcFoNT38AmmpYIz4EAAA="
//   }
// })

// exports.handler({
//     "Records": [
//         {
//             "kinesis": {
//                 "kinesisSchemaVersion": "1.0",
//                 "partitionKey": "bluemix-nodered",
//                 "sequenceNumber": "49580831982549757066933184131143068709215562117733679154",
//                 "data": "eyJEYXRhIjoicmVxdWVzdC1tZXRyaWNzLWpzXHR7XCJ1cmlcIjpcIi92Mi42L21lL21lc3NhZ2VzP2FjY2Vzc190b2tlbj1FQUFKekdaQThoMEtJQkFDVUVSeFhtcWs5R2tJRWtGZVF5dFlaQVpBZ0FBMWZaQk1YNmVzOEs5UVJWSG04Um1kTVNBd0t0NUVKSWlUc1FJUmxCRzRqSFRXMXA0VXNMSVNNOTF0OTBCQ3dqdERaQUpjM3JpNVdTc2ZGWkFaQnRUMWZ5TWZzdmYzOUxqMGFqZGk2Z2wwMGxaQWY5blRuNElpNEdxdlAzSTMyTGFDckpBWkRaRFwiLFwiZHVyYXRpb25cIjoyNDEsXCJoYXNFcnJvclwiOnRydWUsXCJyZXF1ZXN0XCI6e1wiaGVhZGVyc1wiOntcImFjY2VwdFwiOlwiYXBwbGljYXRpb24vanNvblwiLFwiY29udGVudC10eXBlXCI6XCJhcHBsaWNhdGlvbi9qc29uXCIsXCJjb250ZW50LWxlbmd0aFwiOjY3fSxcImJvZHlcIjpcIntcXFwicmVjaXBpZW50XFxcIjp7XFxcImlkXFxcIjpcXFwiMzgzODI1Mjg0Mjg4MTk2MFxcXCJ9LFxcXCJzZW5kZXJfYWN0aW9uXFxcIjpcXFwidHlwaW5nX29uXFxcIn1cIn0sXCJyZXNwb25zZUZhdWx0XCI6e1wiaGVhZGVyc1wiOntcIngtcGFnZS11c2FnZVwiOlwie1xcXCJjYWxsX2NvdW50XFxcIjoxLFxcXCJ0b3RhbF9jcHV0aW1lXFxcIjoxLFxcXCJ0b3RhbF90aW1lXFxcIjoxfVwiLFwiYWNjZXNzLWNvbnRyb2wtYWxsb3ctb3JpZ2luXCI6XCIqXCIsXCJzdHJpY3QtdHJhbnNwb3J0LXNlY3VyaXR5XCI6XCJtYXgtYWdlPTE1NTUyMDAwOyBwcmVsb2FkXCIsXCJ4LWZiLXRyYWNlLWlkXCI6XCJINkh6OVJQcXhTQlwiLFwieC1mYi1yZXZcIjpcIjM1NzgxNzVcIixcImNvbnRlbnQtdHlwZVwiOlwiYXBwbGljYXRpb24vanNvblwiLFwiZmFjZWJvb2stYXBpLXZlcnNpb25cIjpcInYyLjEwXCIsXCJjYWNoZS1jb250cm9sXCI6XCJuby1zdG9yZVwiLFwicHJhZ21hXCI6XCJuby1jYWNoZVwiLFwiZXhwaXJlc1wiOlwiU2F0LCAwMSBKYW4gMjAwMCAwMDowMDowMCBHTVRcIixcInd3dy1hdXRoZW50aWNhdGVcIjpcIk9BdXRoIFxcXCJGYWNlYm9vayBQbGF0Zm9ybVxcXCIgXFxcImludmFsaWRfcmVxdWVzdFxcXCIgXFxcIigjMTAwKSBObyBtYXRjaGluZyB1c2VyIGZvdW5kXFxcIlwiLFwieC1mYi1kZWJ1Z1wiOlwiZU96bC9GNnRDSDRPc3Q2aFpwUmgwbmc3QzFaYS9Cc0FONkFISndYUmJqc2ZiT0oxL2l5OUNrblN3VmE4V01waHNodzVTazFrdEtwQnB1bTNJQ0ZGc1E9PVwiLFwiZGF0ZVwiOlwiV2VkLCAxNyBKYW4gMjAxOCAxOTozNjoyMyBHTVRcIixcImNvbm5lY3Rpb25cIjpcImNsb3NlXCIsXCJjb250ZW50LWxlbmd0aFwiOlwiMTM5XCJ9LFwic3RhdHVzQ29kZVwiOjQwMCxcImJvZHlcIjp7XCJlcnJvclwiOntcIm1lc3NhZ2VcIjpcIigjMTAwKSBObyBtYXRjaGluZyB1c2VyIGZvdW5kXCIsXCJ0eXBlXCI6XCJPQXV0aEV4Y2VwdGlvblwiLFwiY29kZVwiOjEwMCxcImVycm9yX3N1YmNvZGVcIjoyMDE4MDAxLFwiZmJ0cmFjZV9pZFwiOlwiSDZIejlSUHF4U0JcIn19fX0ifQ==",
//                 "approximateArrivalTimestamp": 1516217842.062
//             },
//             "eventSource": "aws:kinesis",
//             "eventVersion": "1.0",
//             "eventID": "shardId-000000000003:49580831982549757066933184131143068709215562117733679154",
//             "eventName": "aws:kinesis:record",
//             "invokeIdentityArn": "arn:aws:iam::774515094505:role/lambda-smiles",
//             "awsRegion": "us-east-1",
//             "eventSourceARN": "arn:aws:kinesis:us-east-1:774515094505:stream/external-logs-to-es"
//         },
//         {
//             "kinesis": {
//                 "kinesisSchemaVersion": "1.0",
//                 "partitionKey": "bluemix-nodered",
//                 "sequenceNumber": "49580831982549757066933184131144277635035176746908385330",
//                 "data": "eyJEYXRhIjoicmVxdWVzdC1tZXRyaWNzLWpzXHR7XCJ1cmlcIjpcIi92Mi42L21lL21lc3NhZ2VzP2FjY2Vzc190b2tlbj1FQUFKekdaQThoMEtJQkFDVUVSeFhtcWs5R2tJRWtGZVF5dFlaQVpBZ0FBMWZaQk1YNmVzOEs5UVJWSG04Um1kTVNBd0t0NUVKSWlUc1FJUmxCRzRqSFRXMXA0VXNMSVNNOTF0OTBCQ3dqdERaQUpjM3JpNVdTc2ZGWkFaQnRUMWZ5TWZzdmYzOUxqMGFqZGk2Z2wwMGxaQWY5blRuNElpNEdxdlAzSTMyTGFDckpBWkRaRFwiLFwiZHVyYXRpb25cIjoyNjEsXCJoYXNFcnJvclwiOnRydWUsXCJyZXF1ZXN0XCI6e1wiaGVhZGVyc1wiOntcImFjY2VwdFwiOlwiYXBwbGljYXRpb24vanNvblwiLFwiY29udGVudC10eXBlXCI6XCJhcHBsaWNhdGlvbi9qc29uXCIsXCJjb250ZW50LWxlbmd0aFwiOjI1Mzh9LFwiYm9keVwiOlwie1xcXCJyZWNpcGllbnRcXFwiOntcXFwiaWRcXFwiOlxcXCIzODM4MjUyODQyODgxOTYwXFxcIn0sXFxcIm1lc3NhZ2VcXFwiOntcXFwidGV4dFxcXCI6XFxcIk7Do28gZW50ZW5kaSBvIHF1ZSB2b2PDqiBxdWVyLiBTb2JyZSBvIHF1ZSBkZXNlamEgZmFsYXI/XFxcIixcXFwicXVpY2tfcmVwbGllc1xcXCI6W3tcXFwiY29udGVudF90eXBlXFxcIjpcXFwidGV4dFxcXCIsXFxcInRpdGxlXFxcIjpcXFwiUHJvbW/Dp8O1ZXNcXFwiLFxcXCJwYXlsb2FkXFxcIjpcXFwicXVpY2tfcmVwbHlcXFwifSx7XFxcImNvbnRlbnRfdHlwZVxcXCI6XFxcInRleHRcXFwiLFxcXCJ0aXRsZVxcXCI6XFxcIkJ1c2NhciB2b29cXFwiLFxcXCJwYXlsb2FkXFxcIjpcXFwicXVpY2tfcmVwbHlcXFwifSx7XFxcImNvbnRlbnRfdHlwZVxcXCI6XFxcInRleHRcXFwiLFxcXCJ0aXRsZVxcXCI6XFxcIkNhZGFzdHJhclxcXCIsXFxcInBheWxvYWRcXFwiOlxcXCJxdWlja19yZXBseVxcXCJ9LHtcXFwiY29udGVudF90eXBlXFxcIjpcXFwidGV4dFxcXCIsXFxcInRpdGxlXFxcIjpcXFwiRmFsZSBjb20gU21pbGVzXFxcIixcXFwicGF5bG9hZFxcXCI6XFxcInF1aWNrX3JlcGx5XFxcIn1dfSxcXFwiY29udGV4dFxcXCI6e1xcXCJ0aW1lem9uZVxcXCI6XFxcIkdNVHVuZGVmaW5lZFxcXCIsXFxcImZsaWdodF9jb3VudGVyXFxcIjowLFxcXCJmbGlnaHRCYWNrX2NvdW50ZXJcXFwiOjAsXFxcInNtaWxlc191cmxzXFxcIjp7XFxcInJlY3VwZXJhcl9zZW5oYVxcXCI6XFxcImh0dHBzOi8vZ29vLmdsL3BhSllORVxcXCIsXFxcImNvbXByYXJfbWlsaGFzXFxcIjpcXFwiaHR0cHM6Ly9nb28uZ2wvWm5iWWZUXFxcIixcXFwibWV1c192b29zXFxcIjpcXFwiaHR0cHM6Ly9nb28uZ2wvQXJGSkNyXFxcIixcXFwiYmFnYWdlbnNfZV9hc3NlbnRvc1xcXCI6XFxcImh0dHBzOi8vZ29vLmdsL3Q3RTJWUVxcXCIsXFxcIndlYnNpdGVcXFwiOlxcXCJodHRwczovL2dvby5nbC83a1dESzdcXFwiLFxcXCJjbHViZV9zbWlsZXNcXFwiOlxcXCJodHRwczovL2dvby5nbC9VUjczTXZcXFwiLFxcXCJ0ZXJtb3NfZGVfdmlhZ2VtXFxcIjpcXFwiaHR0cHM6Ly9nb28uZ2wvZjFZdFpHXFxcIixcXFwicGFnaW5hX2xvZ2luXFxcIjpcXFwiaHR0cHM6Ly9nb28uZ2wvUGRKTkV4XFxcIixcXFwiaGVscFxcXCI6XFxcImh0dHBzOi8vZ29vLmdsL2tkZ2NiN1xcXCIsXFxcImFjY2Vzc19hY2NvdW50XFxcIjpcXFwiaHR0cHM6Ly9nb28uZ2wvSkpFbllYXFxcIn0sXFxcImxpbWl0c0ZvckJvb2tpbmdcXFwiOntcXFwibG93ZXJcXFwiOntcXFwiZGF0ZVxcXCI6XFxcIjIwMTgtMDEtMTdcXFwiLFxcXCJob3VyXFxcIjpcXFwiMDU6MzZcXFwifSxcXFwidXBwZXJcXFwiOntcXFwiZGF0ZVxcXCI6XFxcIjIwMTgtMTItMTNcXFwiLFxcXCJob3VyXFxcIjpcXFwiMDU6MzZcXFwifSxcXFwiY3VycmVudFxcXCI6e1xcXCJkYXRlXFxcIjpcXFwiMjAxOC0wMS0xN1xcXCIsXFxcImhvdXJcXFwiOlxcXCIwNTozNlxcXCJ9fSxcXFwibW9udGhMYXN0RGF0ZVxcXCI6XFxcIjMxLzAxLzIwMThcXFwiLFxcXCJjb252ZXJzYXRpb25faWRcXFwiOlxcXCI0YmI4MDIyNS05M2YzLTRmZDYtOGVlMy02YzU1ZDMyYzVhZDhcXFwiLFxcXCJzeXN0ZW1cXFwiOntcXFwiZGlhbG9nX3N0YWNrXFxcIjpbe1xcXCJkaWFsb2dfbm9kZVxcXCI6XFxcInJvb3RcXFwifV0sXFxcImRpYWxvZ190dXJuX2NvdW50ZXJcXFwiOjUsXFxcImRpYWxvZ19yZXF1ZXN0X2NvdW50ZXJcXFwiOjUsXFxcIl9ub2RlX291dHB1dF9tYXBcXFwiOntcXFwiQmVtLXZpbmRvXFxcIjpbMF0sXFxcIkVtIG91dHJvcyBjYXNvc1xcXCI6WzBdfSxcXFwiYnJhbmNoX2V4aXRlZFxcXCI6dHJ1ZSxcXFwiYnJhbmNoX2V4aXRlZF9yZWFzb25cXFwiOlxcXCJjb21wbGV0ZWRcXFwifSxcXFwidG9cXFwiOlxcXCJcXFwiLFxcXCJ0YXhcXFwiOlxcXCJcXFwiLFxcXCJmcm9tXFxcIjpcXFwiXFxcIixcXFwidGVybVxcXCI6XFxcIlxcXCIsXFxcImF0aXZvXFxcIjpcXFwiXFxcIixcXFwiY2x1YmVcXFwiOlxcXCJcXFwiLFxcXCJvcHRpblxcXCI6ZmFsc2UsXFxcInRpbWVyXFxcIjpcXFwiXFxcIixcXFwidG9kYXlcXFwiOlxcXCJcXFwiLFxcXCJpbnRlbnRcXFwiOlxcXCJcXFwiLFxcXCJtZW1iZXJcXFwiOlxcXCJcXFwiLFxcXCJyZXR1cm5cXFwiOlxcXCJcXFwiLFxcXCJzZWFyY2hcXFwiOlxcXCJcXFwiLFxcXCJvcHRpb25zXFxcIjpbXFxcIlByb21vw6fDtWVzXFxcIixcXFwiQnVzY2FyIHZvb1xcXCIsXFxcIkNhZGFzdHJhclxcXCIsXFxcIkZhbGUgY29tIFNtaWxlc1xcXCJdLFxcXCJzdW1tYXJ5XFxcIjpcXFwiXFxcIixcXFwiYWlycG9ydHNcXFwiOlxcXCJcXFwiLFxcXCJkYXRhX2lkYVxcXCI6XFxcIlxcXCIsXFxcImVsZWdpdmVsXFxcIjpudWxsLFxcXCJyZWdpc3RlclxcXCI6bnVsbCxcXFwiY2hlY2tEYXRlXFxcIjpcXFwiXFxcIixcXFwiY3BmVmFsaWRvXFxcIjpcXFwiXFxcIixcXFwiZGVwYXJ0dXJlXFxcIjpcXFwiXFxcIixcXFwiY2hlY2tFbWFpbFxcXCI6XFxcIlxcXCIsXFxcImNoZWNrX2RhdGVcXFwiOlxcXCJcXFwiLFxcXCJkYXRhX3ZvbHRhXFxcIjpcXFwiXFxcIixcXFwicGFzc2VuZ2Vyc1xcXCI6XFxcIlxcXCIsXFxcInByb21vQ2x1YmVcXFwiOm51bGwsXFxcInZhbGlkYXJDUEZcXFwiOm51bGwsXFxcInJnX2NhZGFzdHJvXFxcIjpmYWxzZSxcXFwic2VhcmNoT3JkZXJcXFwiOlxcXCJcXFwiLFxcXCJ2YWxpZGFyX2NwZlxcXCI6XFxcIlxcXCIsXFxcImNwZl9jYWRhc3Ryb1xcXCI6ZmFsc2UsXFxcImVtYWlsX3ZhbGlkb1xcXCI6XFxcIlxcXCIsXFxcIm9yaWdlbV9idXNjYVxcXCI6XFxcIlxcXCIsXFxcInByb21vRW50ZW5kYVxcXCI6bnVsbCxcXFwic21pbGVzVmFsaWRvXFxcIjpcXFwiXFxcIixcXFwidmFsaWRhcl90eXBlXFxcIjpcXFwiXFxcIixcXFwiZGF0YV9jYWRhc3Ryb1xcXCI6ZmFsc2UsXFxcImRlc3Rpbm9fYnVzY2FcXFwiOlxcXCJcXFwiLFxcXCJmYXplckNhZGFzdHJvXFxcIjpudWxsLFxcXCJub21lX2NhZGFzdHJvXFxcIjpmYWxzZSxcXFwic2VhcmNoX2ZsaWdodFxcXCI6XFxcIlxcXCIsXFxcImRlc2NvbnRvX2NsdWJlXFxcIjpcXFwiXFxcIixcXFwiZW1haWxfY2FkYXN0cm9cXFwiOmZhbHNlLFxcXCJwcm9tb1BhcnRpY2lwZVxcXCI6bnVsbCxcXFwic2VudFRvQ2hlY2tvdXRcXFwiOlxcXCJcXFwiLFxcXCJhZGRfdG9fY2hlY2tvdXRcXFwiOlxcXCJcXFwiLFxcXCJnZW5lcm9fY2FkYXN0cm9cXFwiOmZhbHNlLFxcXCJwYXNzZW5nZXJfZW1haWxcXFwiOlxcXCJcXFwiLFxcXCJyZXR1cm5fc2VsZWN0ZWRcXFwiOlxcXCJcXFwiLFxcXCJzZWFyY2hGYXZvcml0ZXNcXFwiOlxcXCJcXFwiLFxcXCJzZWdtZW50U2VsZWN0ZWRcXFwiOm51bGwsXFxcIm11bHRpcGxlX2FpcnBvcnRzXFxcIjpcXFwiXFxcIixcXFwicGFzc2FnZWlyb3NfYmViZXNcXFwiOlxcXCJcXFwiLFxcXCJzZWxlY3RlZF9mYXZvcml0ZVxcXCI6XFxcIlxcXCIsXFxcInRvdGFsX3Bhc3NhZ2Vpcm9zXFxcIjpcXFwiXFxcIixcXFwiZGVwYXJ0dXJlX3NlbGVjdGVkXFxcIjpcXFwiXFxcIixcXFwic29icmVub21lX2NhZGFzdHJvXFxcIjpmYWxzZSxcXFwicGFzc2FnZWlyb3NfYWR1bHRvc1xcXCI6XFxcIlxcXCIsXFxcInBhc3NhZ2Vpcm9zX2NyaWFuY2FzXFxcIjpcXFwiXFxcIixcXFwicmV0dXJuX3NlbGVjdGVkX2ZsaWdodFxcXCI6bnVsbCxcXFwiZGVwYXJ0dXJlX3NlbGVjdGVkX2ZsaWdodFxcXCI6bnVsbH19XCJ9LFwicmVzcG9uc2VGYXVsdFwiOntcImhlYWRlcnNcIjp7XCJ4LXBhZ2UtdXNhZ2VcIjpcIntcXFwiY2FsbF9jb3VudFxcXCI6MSxcXFwidG90YWxfY3B1dGltZVxcXCI6MSxcXFwidG90YWxfdGltZVxcXCI6MX1cIixcImFjY2Vzcy1jb250cm9sLWFsbG93LW9yaWdpblwiOlwiKlwiLFwic3RyaWN0LXRyYW5zcG9ydC1zZWN1cml0eVwiOlwibWF4LWFnZT0xNTU1MjAwMDsgcHJlbG9hZFwiLFwieC1mYi10cmFjZS1pZFwiOlwiRWtPUnQvblNyelRcIixcIngtZmItcmV2XCI6XCIzNTc4MTc1XCIsXCJjb250ZW50LXR5cGVcIjpcImFwcGxpY2F0aW9uL2pzb25cIixcImZhY2Vib29rLWFwaS12ZXJzaW9uXCI6XCJ2Mi4xMFwiLFwiY2FjaGUtY29udHJvbFwiOlwibm8tc3RvcmVcIixcInByYWdtYVwiOlwibm8tY2FjaGVcIixcImV4cGlyZXNcIjpcIlNhdCwgMDEgSmFuIDIwMDAgMDA6MDA6MDAgR01UXCIsXCJ3d3ctYXV0aGVudGljYXRlXCI6XCJPQXV0aCBcXFwiRmFjZWJvb2sgUGxhdGZvcm1cXFwiIFxcXCJpbnZhbGlkX3JlcXVlc3RcXFwiIFxcXCIoIzEwMCkgTm8gbWF0Y2hpbmcgdXNlciBmb3VuZFxcXCJcIixcIngtZmItZGVidWdcIjpcIk9scXhGSGM3UVRWOFRIelJrZ1g4aFFPK0VneGo5bFgvMGx2M0p1VjJFUi8vb2dRSWwxZHlzREJDV1FpNGxnSVNrWUVvdVJTdjdzeU1nQ0d1Ry8rWVFnPT1cIixcImRhdGVcIjpcIldlZCwgMTcgSmFuIDIwMTggMTk6MzY6MjkgR01UXCIsXCJjb25uZWN0aW9uXCI6XCJjbG9zZVwiLFwiY29udGVudC1sZW5ndGhcIjpcIjE0MFwifSxcInN0YXR1c0NvZGVcIjo0MDAsXCJib2R5XCI6e1wiZXJyb3JcIjp7XCJtZXNzYWdlXCI6XCIoIzEwMCkgTm8gbWF0Y2hpbmcgdXNlciBmb3VuZFwiLFwidHlwZVwiOlwiT0F1dGhFeGNlcHRpb25cIixcImNvZGVcIjoxMDAsXCJlcnJvcl9zdWJjb2RlXCI6MjAxODAwMSxcImZidHJhY2VfaWRcIjpcIkVrT1J0L25TcnpUXCJ9fX19In0=",
//                 "approximateArrivalTimestamp": 1516217842.065
//             },
//             "eventSource": "aws:kinesis",
//             "eventVersion": "1.0",
//             "eventID": "shardId-000000000003:49580831982549757066933184131144277635035176746908385330",
//             "eventName": "aws:kinesis:record",
//             "invokeIdentityArn": "arn:aws:iam::774515094505:role/lambda-smiles",
//             "awsRegion": "us-east-1",
//             "eventSourceARN": "arn:aws:kinesis:us-east-1:774515094505:stream/external-logs-to-es"
//         },
//         {
//             "kinesis": {
//                 "kinesisSchemaVersion": "1.0",
//                 "partitionKey": "bluemix-nodered",
//                 "sequenceNumber": "49580831982549757066933184131145486560854809311866519602",
//                 "data": "eyJEYXRhIjoicmVxdWVzdC1tZXRyaWNzLWpzXHR7XCJ1cmlcIjpcIi92Mi42L21lL21lc3NhZ2VzP2FjY2Vzc190b2tlbj1FQUFKekdaQThoMEtJQkFDVUVSeFhtcWs5R2tJRWtGZVF5dFlaQVpBZ0FBMWZaQk1YNmVzOEs5UVJWSG04Um1kTVNBd0t0NUVKSWlUc1FJUmxCRzRqSFRXMXA0VXNMSVNNOTF0OTBCQ3dqdERaQUpjM3JpNVdTc2ZGWkFaQnRUMWZ5TWZzdmYzOUxqMGFqZGk2Z2wwMGxaQWY5blRuNElpNEdxdlAzSTMyTGFDckpBWkRaRFwiLFwiZHVyYXRpb25cIjoyMjIsXCJoYXNFcnJvclwiOnRydWUsXCJyZXF1ZXN0XCI6e1wiaGVhZGVyc1wiOntcImFjY2VwdFwiOlwiYXBwbGljYXRpb24vanNvblwiLFwiY29udGVudC10eXBlXCI6XCJhcHBsaWNhdGlvbi9qc29uXCIsXCJjb250ZW50LWxlbmd0aFwiOjY3fSxcImJvZHlcIjpcIntcXFwicmVjaXBpZW50XFxcIjp7XFxcImlkXFxcIjpcXFwiMzgzODI1Mjg0Mjg4MTk2MFxcXCJ9LFxcXCJzZW5kZXJfYWN0aW9uXFxcIjpcXFwidHlwaW5nX29uXFxcIn1cIn0sXCJyZXNwb25zZUZhdWx0XCI6e1wiaGVhZGVyc1wiOntcIngtcGFnZS11c2FnZVwiOlwie1xcXCJjYWxsX2NvdW50XFxcIjoxLFxcXCJ0b3RhbF9jcHV0aW1lXFxcIjoxLFxcXCJ0b3RhbF90aW1lXFxcIjoxfVwiLFwiYWNjZXNzLWNvbnRyb2wtYWxsb3ctb3JpZ2luXCI6XCIqXCIsXCJzdHJpY3QtdHJhbnNwb3J0LXNlY3VyaXR5XCI6XCJtYXgtYWdlPTE1NTUyMDAwOyBwcmVsb2FkXCIsXCJ4LWZiLXRyYWNlLWlkXCI6XCJGcUJiS25jWXgvNVwiLFwieC1mYi1yZXZcIjpcIjM1NzgxNzVcIixcImNvbnRlbnQtdHlwZVwiOlwiYXBwbGljYXRpb24vanNvblwiLFwiZmFjZWJvb2stYXBpLXZlcnNpb25cIjpcInYyLjEwXCIsXCJjYWNoZS1jb250cm9sXCI6XCJuby1zdG9yZVwiLFwicHJhZ21hXCI6XCJuby1jYWNoZVwiLFwiZXhwaXJlc1wiOlwiU2F0LCAwMSBKYW4gMjAwMCAwMDowMDowMCBHTVRcIixcInd3dy1hdXRoZW50aWNhdGVcIjpcIk9BdXRoIFxcXCJGYWNlYm9vayBQbGF0Zm9ybVxcXCIgXFxcImludmFsaWRfcmVxdWVzdFxcXCIgXFxcIigjMTAwKSBObyBtYXRjaGluZyB1c2VyIGZvdW5kXFxcIlwiLFwieC1mYi1kZWJ1Z1wiOlwic0g0R2M3UmR1SkZaQytnMDdXOWE3WSsvQXlpT01pY0xFTDhaYWNCUEUxUFBIQUJOL05VOU0wUkNGY0c4RE9xVU9FbUJXajIrUUlwRjN4c2xsU3BXY1E9PVwiLFwiZGF0ZVwiOlwiV2VkLCAxNyBKYW4gMjAxOCAxOTozODowOCBHTVRcIixcImNvbm5lY3Rpb25cIjpcImNsb3NlXCIsXCJjb250ZW50LWxlbmd0aFwiOlwiMTQwXCJ9LFwic3RhdHVzQ29kZVwiOjQwMCxcImJvZHlcIjp7XCJlcnJvclwiOntcIm1lc3NhZ2VcIjpcIigjMTAwKSBObyBtYXRjaGluZyB1c2VyIGZvdW5kXCIsXCJ0eXBlXCI6XCJPQXV0aEV4Y2VwdGlvblwiLFwiY29kZVwiOjEwMCxcImVycm9yX3N1YmNvZGVcIjoyMDE4MDAxLFwiZmJ0cmFjZV9pZFwiOlwiRnFCYktuY1l4LzVcIn19fX0ifQ==",
//                 "approximateArrivalTimestamp": 1516218102.463
//             },
//             "eventSource": "aws:kinesis",
//             "eventVersion": "1.0",
//             "eventID": "shardId-000000000003:49580831982549757066933184131145486560854809311866519602",
//             "eventName": "aws:kinesis:record",
//             "invokeIdentityArn": "arn:aws:iam::774515094505:role/lambda-smiles",
//             "awsRegion": "us-east-1",
//             "eventSourceARN": "arn:aws:kinesis:us-east-1:774515094505:stream/external-logs-to-es"
//         },
//         {
//             "kinesis": {
//                 "kinesisSchemaVersion": "1.0",
//                 "partitionKey": "bluemix-nodered",
//                 "sequenceNumber": "49580831982549757066933184131146695486674423941041225778",
//                 "data": "eyJEYXRhIjoicmVxdWVzdC1tZXRyaWNzLWpzXHR7XCJ1cmlcIjpcIi92Mi42L21lL21lc3NhZ2VzP2FjY2Vzc190b2tlbj1FQUFKekdaQThoMEtJQkFDVUVSeFhtcWs5R2tJRWtGZVF5dFlaQVpBZ0FBMWZaQk1YNmVzOEs5UVJWSG04Um1kTVNBd0t0NUVKSWlUc1FJUmxCRzRqSFRXMXA0VXNMSVNNOTF0OTBCQ3dqdERaQUpjM3JpNVdTc2ZGWkFaQnRUMWZ5TWZzdmYzOUxqMGFqZGk2Z2wwMGxaQWY5blRuNElpNEdxdlAzSTMyTGFDckpBWkRaRFwiLFwiZHVyYXRpb25cIjoyMjQsXCJoYXNFcnJvclwiOnRydWUsXCJyZXF1ZXN0XCI6e1wiaGVhZGVyc1wiOntcImFjY2VwdFwiOlwiYXBwbGljYXRpb24vanNvblwiLFwiY29udGVudC10eXBlXCI6XCJhcHBsaWNhdGlvbi9qc29uXCIsXCJjb250ZW50LWxlbmd0aFwiOjI1Mzh9LFwiYm9keVwiOlwie1xcXCJyZWNpcGllbnRcXFwiOntcXFwiaWRcXFwiOlxcXCIzODM4MjUyODQyODgxOTYwXFxcIn0sXFxcIm1lc3NhZ2VcXFwiOntcXFwidGV4dFxcXCI6XFxcIk7Do28gZW50ZW5kaSBvIHF1ZSB2b2PDqiBxdWVyLiBTb2JyZSBvIHF1ZSBkZXNlamEgZmFsYXI/XFxcIixcXFwicXVpY2tfcmVwbGllc1xcXCI6W3tcXFwiY29udGVudF90eXBlXFxcIjpcXFwidGV4dFxcXCIsXFxcInRpdGxlXFxcIjpcXFwiUHJvbW/Dp8O1ZXNcXFwiLFxcXCJwYXlsb2FkXFxcIjpcXFwicXVpY2tfcmVwbHlcXFwifSx7XFxcImNvbnRlbnRfdHlwZVxcXCI6XFxcInRleHRcXFwiLFxcXCJ0aXRsZVxcXCI6XFxcIkJ1c2NhciB2b29cXFwiLFxcXCJwYXlsb2FkXFxcIjpcXFwicXVpY2tfcmVwbHlcXFwifSx7XFxcImNvbnRlbnRfdHlwZVxcXCI6XFxcInRleHRcXFwiLFxcXCJ0aXRsZVxcXCI6XFxcIkNhZGFzdHJhclxcXCIsXFxcInBheWxvYWRcXFwiOlxcXCJxdWlja19yZXBseVxcXCJ9LHtcXFwiY29udGVudF90eXBlXFxcIjpcXFwidGV4dFxcXCIsXFxcInRpdGxlXFxcIjpcXFwiRmFsZSBjb20gU21pbGVzXFxcIixcXFwicGF5bG9hZFxcXCI6XFxcInF1aWNrX3JlcGx5XFxcIn1dfSxcXFwiY29udGV4dFxcXCI6e1xcXCJ0aW1lem9uZVxcXCI6XFxcIkdNVHVuZGVmaW5lZFxcXCIsXFxcImZsaWdodF9jb3VudGVyXFxcIjowLFxcXCJmbGlnaHRCYWNrX2NvdW50ZXJcXFwiOjAsXFxcInNtaWxlc191cmxzXFxcIjp7XFxcInJlY3VwZXJhcl9zZW5oYVxcXCI6XFxcImh0dHBzOi8vZ29vLmdsL3BhSllORVxcXCIsXFxcImNvbXByYXJfbWlsaGFzXFxcIjpcXFwiaHR0cHM6Ly9nb28uZ2wvWm5iWWZUXFxcIixcXFwibWV1c192b29zXFxcIjpcXFwiaHR0cHM6Ly9nb28uZ2wvQXJGSkNyXFxcIixcXFwiYmFnYWdlbnNfZV9hc3NlbnRvc1xcXCI6XFxcImh0dHBzOi8vZ29vLmdsL3Q3RTJWUVxcXCIsXFxcIndlYnNpdGVcXFwiOlxcXCJodHRwczovL2dvby5nbC83a1dESzdcXFwiLFxcXCJjbHViZV9zbWlsZXNcXFwiOlxcXCJodHRwczovL2dvby5nbC9VUjczTXZcXFwiLFxcXCJ0ZXJtb3NfZGVfdmlhZ2VtXFxcIjpcXFwiaHR0cHM6Ly9nb28uZ2wvZjFZdFpHXFxcIixcXFwicGFnaW5hX2xvZ2luXFxcIjpcXFwiaHR0cHM6Ly9nb28uZ2wvUGRKTkV4XFxcIixcXFwiaGVscFxcXCI6XFxcImh0dHBzOi8vZ29vLmdsL2tkZ2NiN1xcXCIsXFxcImFjY2Vzc19hY2NvdW50XFxcIjpcXFwiaHR0cHM6Ly9nb28uZ2wvSkpFbllYXFxcIn0sXFxcImxpbWl0c0ZvckJvb2tpbmdcXFwiOntcXFwibG93ZXJcXFwiOntcXFwiZGF0ZVxcXCI6XFxcIjIwMTgtMDEtMTdcXFwiLFxcXCJob3VyXFxcIjpcXFwiMDU6MzhcXFwifSxcXFwidXBwZXJcXFwiOntcXFwiZGF0ZVxcXCI6XFxcIjIwMTgtMTItMTNcXFwiLFxcXCJob3VyXFxcIjpcXFwiMDU6MzhcXFwifSxcXFwiY3VycmVudFxcXCI6e1xcXCJkYXRlXFxcIjpcXFwiMjAxOC0wMS0xN1xcXCIsXFxcImhvdXJcXFwiOlxcXCIwNTozOFxcXCJ9fSxcXFwibW9udGhMYXN0RGF0ZVxcXCI6XFxcIjMxLzAxLzIwMThcXFwiLFxcXCJjb252ZXJzYXRpb25faWRcXFwiOlxcXCI0YmI4MDIyNS05M2YzLTRmZDYtOGVlMy02YzU1ZDMyYzVhZDhcXFwiLFxcXCJzeXN0ZW1cXFwiOntcXFwiZGlhbG9nX3N0YWNrXFxcIjpbe1xcXCJkaWFsb2dfbm9kZVxcXCI6XFxcInJvb3RcXFwifV0sXFxcImRpYWxvZ190dXJuX2NvdW50ZXJcXFwiOjYsXFxcImRpYWxvZ19yZXF1ZXN0X2NvdW50ZXJcXFwiOjYsXFxcIl9ub2RlX291dHB1dF9tYXBcXFwiOntcXFwiQmVtLXZpbmRvXFxcIjpbMF0sXFxcIkVtIG91dHJvcyBjYXNvc1xcXCI6WzBdfSxcXFwiYnJhbmNoX2V4aXRlZFxcXCI6dHJ1ZSxcXFwiYnJhbmNoX2V4aXRlZF9yZWFzb25cXFwiOlxcXCJjb21wbGV0ZWRcXFwifSxcXFwidG9cXFwiOlxcXCJcXFwiLFxcXCJ0YXhcXFwiOlxcXCJcXFwiLFxcXCJmcm9tXFxcIjpcXFwiXFxcIixcXFwidGVybVxcXCI6XFxcIlxcXCIsXFxcImF0aXZvXFxcIjpcXFwiXFxcIixcXFwiY2x1YmVcXFwiOlxcXCJcXFwiLFxcXCJvcHRpblxcXCI6ZmFsc2UsXFxcInRpbWVyXFxcIjpcXFwiXFxcIixcXFwidG9kYXlcXFwiOlxcXCJcXFwiLFxcXCJpbnRlbnRcXFwiOlxcXCJcXFwiLFxcXCJtZW1iZXJcXFwiOlxcXCJcXFwiLFxcXCJyZXR1cm5cXFwiOlxcXCJcXFwiLFxcXCJzZWFyY2hcXFwiOlxcXCJcXFwiLFxcXCJvcHRpb25zXFxcIjpbXFxcIlByb21vw6fDtWVzXFxcIixcXFwiQnVzY2FyIHZvb1xcXCIsXFxcIkNhZGFzdHJhclxcXCIsXFxcIkZhbGUgY29tIFNtaWxlc1xcXCJdLFxcXCJzdW1tYXJ5XFxcIjpcXFwiXFxcIixcXFwiYWlycG9ydHNcXFwiOlxcXCJcXFwiLFxcXCJkYXRhX2lkYVxcXCI6XFxcIlxcXCIsXFxcImVsZWdpdmVsXFxcIjpudWxsLFxcXCJyZWdpc3RlclxcXCI6bnVsbCxcXFwiY2hlY2tEYXRlXFxcIjpcXFwiXFxcIixcXFwiY3BmVmFsaWRvXFxcIjpcXFwiXFxcIixcXFwiZGVwYXJ0dXJlXFxcIjpcXFwiXFxcIixcXFwiY2hlY2tFbWFpbFxcXCI6XFxcIlxcXCIsXFxcImNoZWNrX2RhdGVcXFwiOlxcXCJcXFwiLFxcXCJkYXRhX3ZvbHRhXFxcIjpcXFwiXFxcIixcXFwicGFzc2VuZ2Vyc1xcXCI6XFxcIlxcXCIsXFxcInByb21vQ2x1YmVcXFwiOm51bGwsXFxcInZhbGlkYXJDUEZcXFwiOm51bGwsXFxcInJnX2NhZGFzdHJvXFxcIjpmYWxzZSxcXFwic2VhcmNoT3JkZXJcXFwiOlxcXCJcXFwiLFxcXCJ2YWxpZGFyX2NwZlxcXCI6XFxcIlxcXCIsXFxcImNwZl9jYWRhc3Ryb1xcXCI6ZmFsc2UsXFxcImVtYWlsX3ZhbGlkb1xcXCI6XFxcIlxcXCIsXFxcIm9yaWdlbV9idXNjYVxcXCI6XFxcIlxcXCIsXFxcInByb21vRW50ZW5kYVxcXCI6bnVsbCxcXFwic21pbGVzVmFsaWRvXFxcIjpcXFwiXFxcIixcXFwidmFsaWRhcl90eXBlXFxcIjpcXFwiXFxcIixcXFwiZGF0YV9jYWRhc3Ryb1xcXCI6ZmFsc2UsXFxcImRlc3Rpbm9fYnVzY2FcXFwiOlxcXCJcXFwiLFxcXCJmYXplckNhZGFzdHJvXFxcIjpudWxsLFxcXCJub21lX2NhZGFzdHJvXFxcIjpmYWxzZSxcXFwic2VhcmNoX2ZsaWdodFxcXCI6XFxcIlxcXCIsXFxcImRlc2NvbnRvX2NsdWJlXFxcIjpcXFwiXFxcIixcXFwiZW1haWxfY2FkYXN0cm9cXFwiOmZhbHNlLFxcXCJwcm9tb1BhcnRpY2lwZVxcXCI6bnVsbCxcXFwic2VudFRvQ2hlY2tvdXRcXFwiOlxcXCJcXFwiLFxcXCJhZGRfdG9fY2hlY2tvdXRcXFwiOlxcXCJcXFwiLFxcXCJnZW5lcm9fY2FkYXN0cm9cXFwiOmZhbHNlLFxcXCJwYXNzZW5nZXJfZW1haWxcXFwiOlxcXCJcXFwiLFxcXCJyZXR1cm5fc2VsZWN0ZWRcXFwiOlxcXCJcXFwiLFxcXCJzZWFyY2hGYXZvcml0ZXNcXFwiOlxcXCJcXFwiLFxcXCJzZWdtZW50U2VsZWN0ZWRcXFwiOm51bGwsXFxcIm11bHRpcGxlX2FpcnBvcnRzXFxcIjpcXFwiXFxcIixcXFwicGFzc2FnZWlyb3NfYmViZXNcXFwiOlxcXCJcXFwiLFxcXCJzZWxlY3RlZF9mYXZvcml0ZVxcXCI6XFxcIlxcXCIsXFxcInRvdGFsX3Bhc3NhZ2Vpcm9zXFxcIjpcXFwiXFxcIixcXFwiZGVwYXJ0dXJlX3NlbGVjdGVkXFxcIjpcXFwiXFxcIixcXFwic29icmVub21lX2NhZGFzdHJvXFxcIjpmYWxzZSxcXFwicGFzc2FnZWlyb3NfYWR1bHRvc1xcXCI6XFxcIlxcXCIsXFxcInBhc3NhZ2Vpcm9zX2NyaWFuY2FzXFxcIjpcXFwiXFxcIixcXFwicmV0dXJuX3NlbGVjdGVkX2ZsaWdodFxcXCI6bnVsbCxcXFwiZGVwYXJ0dXJlX3NlbGVjdGVkX2ZsaWdodFxcXCI6bnVsbH19XCJ9LFwicmVzcG9uc2VGYXVsdFwiOntcImhlYWRlcnNcIjp7XCJ4LXBhZ2UtdXNhZ2VcIjpcIntcXFwiY2FsbF9jb3VudFxcXCI6MSxcXFwidG90YWxfY3B1dGltZVxcXCI6MSxcXFwidG90YWxfdGltZVxcXCI6MX1cIixcImFjY2Vzcy1jb250cm9sLWFsbG93LW9yaWdpblwiOlwiKlwiLFwic3RyaWN0LXRyYW5zcG9ydC1zZWN1cml0eVwiOlwibWF4LWFnZT0xNTU1MjAwMDsgcHJlbG9hZFwiLFwieC1mYi10cmFjZS1pZFwiOlwiQmhKRmRhNTgwSXpcIixcIngtZmItcmV2XCI6XCIzNTc4MTc1XCIsXCJjb250ZW50LXR5cGVcIjpcImFwcGxpY2F0aW9uL2pzb25cIixcImZhY2Vib29rLWFwaS12ZXJzaW9uXCI6XCJ2Mi4xMFwiLFwiY2FjaGUtY29udHJvbFwiOlwibm8tc3RvcmVcIixcInByYWdtYVwiOlwibm8tY2FjaGVcIixcImV4cGlyZXNcIjpcIlNhdCwgMDEgSmFuIDIwMDAgMDA6MDA6MDAgR01UXCIsXCJ3d3ctYXV0aGVudGljYXRlXCI6XCJPQXV0aCBcXFwiRmFjZWJvb2sgUGxhdGZvcm1cXFwiIFxcXCJpbnZhbGlkX3JlcXVlc3RcXFwiIFxcXCIoIzEwMCkgTm8gbWF0Y2hpbmcgdXNlciBmb3VuZFxcXCJcIixcIngtZmItZGVidWdcIjpcImlYKzlHc24zTDdMNk5qblJhQk15NG44WEFrR0xWLzlyUEJHOVgvTnhZZVFhVW5aRmw1SytWTVJPSy8rTE9VRUkxOFhqbTFEaDQvTFFCMDNZOEtUaW5nPT1cIixcImRhdGVcIjpcIldlZCwgMTcgSmFuIDIwMTggMTk6Mzg6MTYgR01UXCIsXCJjb25uZWN0aW9uXCI6XCJjbG9zZVwiLFwiY29udGVudC1sZW5ndGhcIjpcIjEzOVwifSxcInN0YXR1c0NvZGVcIjo0MDAsXCJib2R5XCI6e1wiZXJyb3JcIjp7XCJtZXNzYWdlXCI6XCIoIzEwMCkgTm8gbWF0Y2hpbmcgdXNlciBmb3VuZFwiLFwidHlwZVwiOlwiT0F1dGhFeGNlcHRpb25cIixcImNvZGVcIjoxMDAsXCJlcnJvcl9zdWJjb2RlXCI6MjAxODAwMSxcImZidHJhY2VfaWRcIjpcIkJoSkZkYTU4MEl6XCJ9fX19In0=",
//                 "approximateArrivalTimestamp": 1516218102.466
//             },
//             "eventSource": "aws:kinesis",
//             "eventVersion": "1.0",
//             "eventID": "shardId-000000000003:49580831982549757066933184131146695486674423941041225778",
//             "eventName": "aws:kinesis:record",
//             "invokeIdentityArn": "arn:aws:iam::774515094505:role/lambda-smiles",
//             "awsRegion": "us-east-1",
//             "eventSourceARN": "arn:aws:kinesis:us-east-1:774515094505:stream/external-logs-to-es"
//         }
//     ]
// })
