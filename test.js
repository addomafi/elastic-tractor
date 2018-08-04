// var p = ".*<[\\w]*:errorCode>%{GREEDYDATA:detailCode}</[\\w]*:errorCode><[\\w]*:message>%{GREEDYDATA:errorMessage}</[\\w]*:message>.*";
// var str = ' <?xml version="1.0" encoding="UTF-8"?> <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>soapenv:Server</faultcode><faultstring>Serviço temporariamente indisponível. Por favor, tente novamente mais tarde.</faultstring><detail><con:fault xmlns:con="http://www.bea.com/wli/sb/context"><con:errorCode>63</con:errorCode><con:reason>Serviço temporariamente indisponível. Por favor, tente novamente mais tarde.</con:reason></con:fault><ns1:BusinessError xmlns:ns1="http://www.smiles.com.br/EBO/Common/V1"><ns1:errorCode>63</ns1:errorCode><ns1:message>Serviço temporariamente indisponível. Por favor, tente novamente mais tarde.</ns1:message><ns1:details><ns1:itemDetail description="body"><![CDATA[<Body xmlns="http://schemas.xmlsoap.org/soap/envelope/"><Fault><faultcode xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="">soapenv:Server</faultcode><faultstring xmlns="">OSB-382000</faultstring><detail xmlns=""><fault xmlns="http://www.bea.com/wli/sb/context"><errorCode>OSB-382000</errorCode><location><node>RouteAPITransaction</node><path>response-pipeline</path></location></fault></detail></Fault></Body>]]></ns1:itemDetail><ns1:itemDetail description="fault"><![CDATA[<fault xmlns="http://www.bea.com/wli/sb/context"><errorCode>OSB-380000</errorCode><location><node>RouteAuthorize</node><path>response-pipeline</path></location></fault>]]></ns1:itemDetail></ns1:details><ns1:dateHourOccurs>2017-07-28T18:56:39.116-03:00</ns1:dateHourOccurs><ns1:idMessage>&lt;a0242e7.N3afacfa9.N58.15d8a18e5bc.N64b9></ns1:idMessage></ns1:BusinessError></detail></soapenv:Fault></soapenv:Body></soapenv:Envelope> ';
//
// require('node-grok').loadDefault(function (err, patterns) {
//     var pattern = patterns.createPattern(p);
//     pattern.parse(str, function (err, obj) {
//         console.log(obj);
//     });
// });

let index = require('./index')

// AWS Logs
// index.handler({
// 	"awslogs": {
//     "data": "H4sIAOVPT1sAA5VW227bOBB971cIxiJogVAWJVKXBHnwpklz32DtuN3URUGJY1uxLCoU5dyQf9+RbMtJ0MuuARMi58zhcIacmad3Fv46cyhLMYHBQwGdHavzsTfofT8/6Pd7nw4620uIustB18IgYJxyJ2Lc4WthpiaftKqKWt4Vd2U3E/NYim4yLo1IZmSiAXJSztMMSrKUkXGWTqaGiIVIMxGnWWoeSAlCJ9OlpHxB3jcaxLxmdx0adh2/S73u1z/OeoOD/uCb5wtPSBoDZw6LIAyD2BEgApexIJCRXBOVVVwmOi1MqvLDNDOgS6T82ggbwFlj2XKz72ip0SIxSpOF22lA3zYWHSwgN6/Vn9qvBpTK2l6PORHnNKJh6DPOQuZyHjBGKY1Cn3te6FB0pIP/kIUu5dyljsciurK5ZTMpxsiIee1iyt0wjHjEMRT0DW4VybWriBMQGg6ot+M4Ow63OePXIxMkUjpBFJNQhIJQCiERsaAkDpxQSk5ZHI5H6IXbCvckczA6TUpyU47M06hT6XTU2Rl1uguRpVIY6I4626OOrLSoHYsy6uJ8KsoDrZXGudEV4MqKDxeQZQpCov+XE5EkUJiGVRRFliYNU/emrOlQM1G5QXcTg/fz96gM8omZNnZ47jMKYiUfGrWn0WjUMWoGef2xUw+kHrbrYW3RqLEJx15jFTnIEyXTfNKqTB7TotXaz1QlDzVuTQ6VvhNagiSXWhnV4qfGFOWPFI5L8hHKmVEFGaZwB7pVqT32E41zhW8F3iqMRVb+TKM/F9oMhv9HZSDiDMx/1ljiyL6qcqMfWvxVfwNexabOMK38bRR3rWQqdAlm72pwSMJW+UjhrVkr8XGeZ/fGu41tuIekMkBEkdpVSUDgZaW2mItHlWMSshM1bzmO80QUZD9LayuOL1s6GkR2FNnMsyn33qAxjPcPJIq8Fv3X6QZysd+7JIOzPhnirakv/hqEawtquy3yqkTf9Ca4cQs5V49plokutx3r/ec0l+qutC4Glm97uxbOfbZr3fvsg9VDF8FniE9T0+VeYHu+9f70aHB+tm1l6QysT5DM1Adrf6rVHLoIcGwXcyDS9sVY6HSl1NoyTMXm6Da1IPDGvnCFT0Xks9hnvutDEEsZBUwmUWIndZTHdZTtHIz1fhP1D9tWzcBdcMAfi5AKfD8igcgdR3HsSxFy5knxK4bWrC+kN38k+2NyLFvzzqLDnJ9cPBz2j0KXTw9PTtzz/p9MiZ6Mk/ngtmA3p8lwcSHlF+MNFv+YY8f/0tvbe02akwEmcXhJ/LdSZo8SHrOxF0mPxKH00AMhx8ETzBUQej6Lkpbovr5hZAabmy1Obi+vgvuLoyy6vfAuhtf5pThxnVBcKvfPqVu418OQMXP3wpZNdsCv31y/l+hLpTf3hrGfgH6RcO5JWdexWbrxQJP0nhsppmT9gBXvZYKTmKXTvHmXvVQXaMC+krB3vn+9pcFUOv+IWX+vKS/UJS7bSvOxwGq452zNYR6DvqjqcW9L6XSSvuK4HB5tJdM0kxpyhAtZZahHtyQUmKQqDa+oKd8aK50AZg98Psj4OgMtG4nW7O7Z8fCg+6qFaM7ZHBWrT1movIRDgVv+oAb9tsbsvk5OdcVBv+blGF83rGtErZhMq3wGclkV8TjN4meQ+F5C66TKrPp41rokW5/OB+vylUOyKqE4zRQetTEd676pytp/KMFmYVPS0O62MagLHveaTsPh3OOtYqsEq3pc5zdsfnKRWX3QC9DWqlLXmPu66K2NuMHuzM5EPrGPswwmIuvpSTVHNx1sYKi0ajpW1EVlrPjBwNdvVjlVVSYtYayszs7WVCzAchtpaWForViU4LPlQkNViKZ0v24vnp+fR3mnbXSel83Yu+d/ASNzaUG+CgAA"
//   }
// }, {}, function(err, data) {
//   console.log(JSON.stringify(data))
// })

// AWS S3
index.handler({
    "Records": [
        {
            "eventVersion": "2.0",
            "eventSource": "aws:s3",
            "awsRegion": "us-east-1",
            "eventTime": "2017-10-31T01:26:38.016Z",
            "eventName": "ObjectCreated:Copy",
            "userIdentity": {
                "principalId": "AWS:AIDAJBVPHBXZ7EEOZ7LUY"
            },
            "requestParameters": {
                "sourceIPAddress": "179.209.1.162"
            },
            "responseElements": {
                "x-amz-request-id": "45BFDDA96AFE1F71",
                "x-amz-id-2": "9btdgKuua01KLjYoxU31Npm4pH0MKKDqGExL0B4P35soMXspif/4UwIkPCdV5dtwihqFUYlo4As="
            },
            "s3": {
                "s3SchemaVersion": "1.0",
                "configurationId": "a00279a9-a354-45ed-b123-9687669b87af",
                "bucket": {
                    "name": "cfstack-prd-ec2-sftp-s3fs-repositorys3bucket-1bzr6g7hpi126",
                    "ownerIdentity": {
                        "principalId": "A1VM0T8EO8QG7F"
                    },
                    "arn": "arn:aws:s3:::cfstack-prd-ec2-sftp-s3fs-repositorys3bucket-1bzr6g7hpi126"
                },
                "object": {
                    "key": "www_a_345848.esw3ccstm_S.201808041000-1100-0.gz",
                    "size": 48369052
                }
            }
        }
    ]
}, {}, function(err, data) {
  console.log(JSON.stringify(data))
})
