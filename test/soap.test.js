/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/


/**********************************************************************************
 * 
 * Unit tests for the SOAP wrapper
 * 
 *********************************************************************************/

const SoapMethodCall = require('../src/soap.js').SoapMethodCall;
const JSDOM = require("jsdom").JSDOM;
const { DomUtil } = require('../src/dom.js');
const assert = require('assert');

const URL = "https://soap-test/nl/jsp/soaprouter.jsp";

function makeSoapMethodCall(urn, methodName, sessionToken, securityToken, delegate) {
    const call = new SoapMethodCall(urn, methodName, sessionToken, securityToken);
    call.transport = delegate;
    return call;
}


function makeSOAPResponseWithNoBody() {
    const doc = DomUtil.parse(`<?xml version='1.0' encoding='UTF-8'?>
        <SOAP-ENV:Envelope xmlns:xsd='http://www.w3.org/2001/XMLSchema' xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns:SOAP-ENV='http://schemas.xmlsoap.org/soap/envelope/' xmlns:ns='http://xml.apache.org/xml-soap'>
        </SOAP-ENV:Envelope>`);
    return DomUtil.toXMLString(doc);
}

function makeSOAPResponseWithEmptyBody() {
    const doc = DomUtil.parse(`<?xml version='1.0' encoding='UTF-8'?>
        <SOAP-ENV:Envelope xmlns:xsd='http://www.w3.org/2001/XMLSchema' xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns:SOAP-ENV='http://schemas.xmlsoap.org/soap/envelope/' xmlns:ns='http://xml.apache.org/xml-soap'>
            <SOAP-ENV:Body>
            </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`);
    return DomUtil.toXMLString(doc);
}

function makeSOAPResponse(methodName /*, p1, t1, v1, p2, t2, v2... */) {
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
        <SOAP-ENV:Envelope xmlns:xsd='http://www.w3.org/2001/XMLSchema' xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns:SOAP-ENV='http://schemas.xmlsoap.org/soap/envelope/' xmlns:ns='http://xml.apache.org/xml-soap'>
            <SOAP-ENV:Body>
                <${methodName}Response>
                </${methodName}Response>
            </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`;
    const dom = new JSDOM(xml, {contentType: "text/xml"});
    const doc = dom.window.document;
    const body = DomUtil.getFirstChildElement(doc.documentElement);
    const response = DomUtil.getFirstChildElement(body);
    for (var i=1; i<arguments.length; i+=3) {
        var pname = arguments[i];
        var ptype = arguments[i+1];
        var pvalue = arguments[i+2];
        var pel = doc.createElement(pname);
        if (ptype == "ns:Element" || ptype == "ns:Document") {
            if (pvalue && pvalue !== "") {
                const parsed = DomUtil.parse(pvalue).documentElement;
                const child = doc.importNode(parsed, true);
                pel.appendChild(child);
            }
        }
        else {
            pel.textContent = pvalue;
        }
        pel.setAttribute("xsi:type", ptype);
        response.appendChild(pel);
    }
    return dom.serialize();
}

function makeSOAPResponseWithExtraElements(methodName) {
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
        <SOAP-ENV:Envelope xmlns:xsd='http://www.w3.org/2001/XMLSchema' xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns:SOAP-ENV='http://schemas.xmlsoap.org/soap/envelope/' xmlns:ns='http://xml.apache.org/xml-soap'>
            <SOAP-ENV:Body>
                <extra/>
                <extra/>
                <${methodName}Response>
                </${methodName}Response>
                <extra/>
            </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`;
    const dom = new JSDOM(xml, {contentType: "text/xml"});
    return dom.serialize();
}

function makeSOAPFault(faultcode, faultstring, detail) {
    const doc = DomUtil.parse(`<?xml version='1.0' encoding='UTF-8'?>
        <SOAP-ENV:Envelope xmlns:xsd='http://www.w3.org/2001/XMLSchema' xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns:SOAP-ENV='http://schemas.xmlsoap.org/soap/envelope/' xmlns:ns='http://xml.apache.org/xml-soap'>
            <SOAP-ENV:Body>
                <SOAP-ENV:Fault>
                <faultcode>${faultcode}</faultcode>
                <faultstring>${faultstring}</faultstring>
                <detail>${detail}</detail>
                </SOAP-ENV:Fault>
            </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`);
    return DomUtil.toXMLString(doc);
}

describe('SOAP', function() {

    describe('Request builder', function() {

        // Asserts that:
        // - a child element with expected tag name exists
        // - this child element has the exepected text content (optional. only if "text" is defined)
        // - this child element has expected attributes with expected values
        function hasChildElement(element, tagName, text /*, att, value, att, value, ... */) {
            const child = DomUtil.findElement(element, tagName);
            assert.notEqual(child, null, `Should find child ${tagName}`);
            if (text !== undefined) {
                const actualText = child.textContent;
                assert.equal(actualText, text, `Element ${tagName} should have expected text value ${text}`);
            }
            for (var i=3; i<arguments.length; i+=2) {
                const attName = arguments[i];
                const attValue = arguments[i+1];
                const actualValue = child.getAttribute(attName);
                assert.equal(actualValue, attValue, `Element ${tagName} should have attribute ${attName} with value ${attValue}`);
            }
            return child;
        }

        it('Should build an mostly empty SOAP call', function() {
            const call = makeSoapMethodCall("xtk:session", "Empty");        // no auth
            const request = call._createHTTPRequest(URL);
            assert.equal(request.url, URL);
            assert.equal(request.method, "POST");
            assert.equal(request.headers["Content-type"], "application/soap+xml");
            assert.equal(request.headers["SoapAction"], "xtk:session#Empty");
            assert.equal(request.headers["X-Security-Token"], "");
            assert.equal(request.headers["Cookie"], "__sessiontoken=");
            const env = DomUtil.parse(request.body).documentElement;
            const header = hasChildElement(env, "SOAP-ENV:Header");
            hasChildElement(header, "Cookie", "__sessiontoken=");
            hasChildElement(header, "X-Security-Token");
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Empty", undefined, "xmlns:m", "urn:xtk:session", "SOAP-ENV:encodingStyle", "http://schemas.xmlsoap.org/soap/encoding/");
            hasChildElement(method, "sessiontoken", "", "xsi:type", "xsd:string");
        });

        it('Should have set authentication tokens', function() {
            const call = makeSoapMethodCall("xtk:session", "Empty", "$session$", "$security$");
            const request = call._createHTTPRequest(URL);
            assert.equal(request.headers["X-Security-Token"], "$security$", "Security token matches");
            assert.equal(request.headers["Cookie"], "__sessiontoken=$session$", "Session token matches");
            const env = DomUtil.parse(request.body).documentElement;
            const header = hasChildElement(env, "SOAP-ENV:Header");
            hasChildElement(header, "Cookie", "__sessiontoken=$session$");
            hasChildElement(header, "X-Security-Token", "$security$");
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Empty");
            hasChildElement(method, "sessiontoken", "$session$", "xsi:type", "xsd:string");
        });

        it('Should set boolean parameters', function() {
            const call = makeSoapMethodCall("xtk:session", "Boolean", "$session$", "$security$");
            const values = [null, undefined, 0, 1, 2, true, false, "true", "false"];
            const expected = [ "false", "false", "false", "true", "true", "true", "false", "true", "false"];
            for (var i=0; i<values.length; i++)
                call.writeBoolean(`p${i}`, values[i]);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Boolean");
            for (var i=0; i<values.length; i++) {
                hasChildElement(method, `p${i}`, expected[i], "xsi:type", "xsd:boolean");
            }
        });

        it('Should set byte parameters', function() {
            const call = makeSoapMethodCall("xtk:session", "Byte", "$session$", "$security$");
            const values = [null, undefined, 0, 1, 2, -3, true, false, NaN, +7, 500, "12", "1.e2", 5.1, 5.9, -5.1, -5.9];
            const expected = [ "0", "0", "0", "1", "2", "-3", "1", "0", "0", "7", "127", "12", "100", "5", "6", "-5", "-6"];
            for (var i=0; i<values.length; i++)
                call.writeByte(`p${i}`, values[i]);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Byte");
            for (var i=0; i<values.length; i++) {
                hasChildElement(method, `p${i}`, expected[i], "xsi:type", "xsd:byte");
            }
        });

        it('Should set short parameters', function() {
            const call = makeSoapMethodCall("xtk:session", "Short", "$session$", "$security$");
            const values = [null, undefined, 0, 1, 2, -3, true, false, NaN, +7, 500, "12", "1.e2", 5.1, 5.9, -5.1, -5.9];
            const expected = [ "0", "0", "0", "1", "2", "-3", "1", "0", "0", "7", "500", "12", "100", "5", "6", "-5", "-6"];
            for (var i=0; i<values.length; i++)
                call.writeShort(`p${i}`, values[i]);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Short");
            for (var i=0; i<values.length; i++) {
                hasChildElement(method, `p${i}`, expected[i], "xsi:type", "xsd:short");
            }
        });

        it('Should set long parameters', function() {
            const call = makeSoapMethodCall("xtk:session", "Long", "$session$", "$security$");
            const values = [null, undefined, 0, 1, 2, -3, true, false, NaN, +7, 500, "12", "1.e2", 5.1, 5.9, -5.1, -5.9];
            const expected = [ "0", "0", "0", "1", "2", "-3", "1", "0", "0", "7", "500", "12", "100", "5", "6", "-5", "-6"];
            for (var i=0; i<values.length; i++)
                call.writeLong(`p${i}`, values[i]);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Long");
            for (var i=0; i<values.length; i++) {
                hasChildElement(method, `p${i}`, expected[i], "xsi:type", "xsd:int");
            }
        });

        it('Should set float parameters', function() {
            const call = makeSoapMethodCall("xtk:session", "Float", "$session$", "$security$");
            const values = [null, undefined, 0, 1, 2, -3, true, false, NaN, +7, 500, "12", "1.e2", 5.1, 5.9, -5.1, -5.9];
            const expected = [ "0", "0", "0", "1", "2", "-3", "1", "0", "0", "7", "500", "12", "100", "5.1", "5.9", "-5.1", "-5.9"];
            for (var i=0; i<values.length; i++)
                call.writeFloat(`p${i}`, values[i]);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Float");
            for (var i=0; i<values.length; i++) {
                hasChildElement(method, `p${i}`, expected[i], "xsi:type", "xsd:float");
            }
        });

        it('Should set double parameters', function() {
            const call = makeSoapMethodCall("xtk:session", "Double", "$session$", "$security$");
            const values = [null, undefined, 0, 1, 2, -3, true, false, NaN, +7, 500, "12", "1.e2", 5.1, 5.9, -5.1, -5.9];
            const expected = [ "0", "0", "0", "1", "2", "-3", "1", "0", "0", "7", "500", "12", "100", "5.1", "5.9", "-5.1", "-5.9"];
            for (var i=0; i<values.length; i++)
                call.writeDouble(`p${i}`, values[i]);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Double");
            for (var i=0; i<values.length; i++) {
                hasChildElement(method, `p${i}`, expected[i], "xsi:type", "xsd:double");
            }
        });

        it('Should set string parameters', function() {
            const call = makeSoapMethodCall("xtk:session", "String", "$session$", "$security$");
            const values = [null, undefined, 0, 1, 2, -3, true, false, NaN, +7, 500, "12", "1.e2", 5.1, 5.9, -5.1, -5.9, "Hello", "<>\""];
            const expected = [ "", "", "0", "1", "2", "-3", "true", "false", "", "7", "500", "12", "1.e2", "5.1", "5.9", "-5.1", "-5.9", "Hello", "<>\""];
            for (var i=0; i<values.length; i++)
                call.writeString(`p${i}`, values[i]);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:String");
            for (var i=0; i<values.length; i++) {
                hasChildElement(method, `p${i}`, expected[i], "xsi:type", "xsd:string");
            }
        });

        it('Should set timestamp parameters', function() {
            const call = makeSoapMethodCall("xtk:session", "Timestamp", "$session$", "$security$");
            const values = [null, undefined, "2020-12-31T12:34:56.789Z", 
                new Date(Date.UTC(2020, 12-1, 31, 12, 34, 56, 789)),
                new Date(Date.UTC(2020, 12-1, 31))
            ];
            const expected = [ "", "", "2020-12-31T12:34:56.789Z", "2020-12-31T12:34:56.789Z", "2020-12-31T00:00:00.000Z"];
            for (var i=0; i<values.length; i++)
                call.writeTimestamp(`p${i}`, values[i]);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Timestamp");
            for (var i=0; i<values.length; i++) {
                hasChildElement(method, `p${i}`, expected[i], "xsi:type", "xsd:datetime");
            }
        });

        it('Should set date parameters', function() {
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$");
            const values = [null, undefined, "2020-12-31T12:34:56.789Z", 
                new Date(Date.UTC(2020, 12-1, 31, 12, 34, 56, 789)),
                new Date(Date.UTC(2020, 12-1, 31))
            ];
            const expected = [ "", "", "2020-12-31T00:00:00.000Z", "2020-12-31T00:00:00.000Z", "2020-12-31T00:00:00.000Z"];
            for (var i=0; i<values.length; i++)
                call.writeDate(`p${i}`, values[i]);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Date");
            for (var i=0; i<values.length; i++) {
                hasChildElement(method, `p${i}`, expected[i], "xsi:type", "xsd:date");
            }
        });

        it('Should set element parameters', function() {
            const xml = '<root att="Hello"><child/></root>';
            const element = DomUtil.parse(xml).documentElement;

            const call = makeSoapMethodCall("xtk:session", "Element", "$session$", "$security$");
            call.writeElement("p", element);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Element");
            const param = hasChildElement(method, "p");
            const actualElement = hasChildElement(param, "root");
            expect(actualElement).toBeTruthy();
            expect(actualElement.getAttribute("att")).toBe("Hello");
        });


        it('Should set element parameters using createElement', function() {
            const call = makeSoapMethodCall("xtk:session", "Element", "$session$", "$security$");
            const element = call.createElement("root");
            element.setAttribute("att", "Hello");
            call.writeElement("p", element);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Element");
            const param = hasChildElement(method, "p");
            const actualElement = hasChildElement(param, "root");
            expect(actualElement).toBeTruthy();
            expect(actualElement.getAttribute("att")).toBe("Hello");
        });

        it('Should write null element', function() {
            const call = makeSoapMethodCall("xtk:session", "Element", "$session$", "$security$");
            call.writeElement("p", null);
            call.writeElement("q", undefined);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Element");
            var param = hasChildElement(method, "p");
            expect(DomUtil.getFirstChildElement(param)).toBeNull();
            param = hasChildElement(method, "q");
            expect(DomUtil.getFirstChildElement(param)).toBeNull();
        });

        it('Should set document parameters', function() {
            const xml = '<root att="Hello"><child/></root>';
            const doc = DomUtil.parse(xml);

            const call = makeSoapMethodCall("xtk:session", "Document", "$session$", "$security$");
            call.writeDocument("p", doc);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Document");
            const param = hasChildElement(method, "p");
            const actualElement = hasChildElement(param, "root");
            expect(actualElement).toBeTruthy();
            expect(actualElement.getAttribute("att")).toBe("Hello");
        });

        it('Should write null document', function() {
            const call = makeSoapMethodCall("xtk:session", "Document", "$session$", "$security$");
            call.writeDocument("p", null);
            call.writeDocument("q", undefined);
            const request = call._createHTTPRequest(URL);
            const env = DomUtil.parse(request.body).documentElement;
            const body = hasChildElement(env, "SOAP-ENV:Body");
            const method = hasChildElement(body, "m:Document");
            var param = hasChildElement(method, "p");
            expect(DomUtil.getFirstChildElement(param)).toBeNull();
            param = hasChildElement(method, "q");
            expect(DomUtil.getFirstChildElement(param)).toBeNull();
        });

    });
/*
    it("Should delegate execution", function() {
        const delegate = function(options) { return Promise.resolve(makeSOAPResponse("Date")); };
        const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$");
        return call.execute(URL, delegate);
    });
*/
    describe("Invalid SOAP responses", function() {

        it("Should fail on empty return value", function() {
            const delegate = function(options) { return Promise.resolve(""); };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).catch(e => {
                expect(e.name).toMatch('SyntaxError');      // "" cannot be parsed as XML
            });
        });

        it("Should fail on non-XSL return value", function() {
            const delegate = function(options) { return Promise.resolve("{'this':'is', 'not':'xml'}"); };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).catch(e => {
                expect(e.name).toMatch('SyntaxError');      // cannot be parsed as XML
            });
        });

        it("Should fail if no SOAP body", function() {
            const delegate = function(options) { return Promise.resolve(makeSOAPResponseWithNoBody()); };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).catch(e => {
                expect(e.name).toMatch('Error');      // body missing
            });
        });

        it("Should fail if empty SOAP body", function() {
            const delegate = function(options) { return Promise.resolve(makeSOAPResponseWithEmptyBody()); };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).catch(e => {
                expect(e.name).toMatch('Error');      // body present but empty
            });
        });

        it("Should handle no response parameters", function() {
            const delegate = function(options) { return Promise.resolve(makeSOAPResponse("Date")); };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                expect(call.checkNoMoreArgs()).toBe(true);
                expect(() => call.getNextString()).toThrow();
            });
        });

        it("Should handle no extra elements", function() {
            const delegate = function(options) { return Promise.resolve(makeSOAPResponseWithExtraElements("Extra")); };
            const call = makeSoapMethodCall("xtk:session", "Extra", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                expect(call.checkNoMoreArgs()).toBe(true);
                expect(() => call.getNextString()).toThrow();
            });
        });
        it("Should should fail on unread responses", function() {
            const delegate = function(options) { return Promise.resolve(makeSOAPResponse("Date", "p", "xsd:string", "dummy")); };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                expect(call.checkNoMoreArgs()).toBe(false);
            });
        });

        it("Should should read response", function() {
            const delegate = function(options) { 
                return Promise.resolve(makeSOAPResponse("Date", 
                    "p", "xsd:string", "Hello",
                    "p", "xsd:string", "World",         // a second string
                    "p", "xsd:boolean", "true",
                    "p", "xsd:boolean", "1",
                    "p", "xsd:byte", "7",
                    "p", "xsd:short", "700",
                    "p", "xsd:int", "200000",
                    "p", "xsd:float", "3.14",
                    "p", "xsd:double", "6.28",
                    "p", "xsd:dateTime", "2020-12-31T12:34:56.789Z",
                    "p", "xsd:date", "2020-12-31T00:00:00.000Z",
                )); 
            };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                expect(call.getNextString()).toBe("Hello");
                expect(call.checkNoMoreArgs()).toBe(false);

                expect(call.getNextString()).toBe("World");
                expect(call.checkNoMoreArgs()).toBe(false);

                expect(call.getNextBoolean()).toBe(true);
                expect(call.checkNoMoreArgs()).toBe(false);

                expect(call.getNextBoolean()).toBe(true);
                expect(call.checkNoMoreArgs()).toBe(false);

                expect(call.getNextByte()).toBe(7);
                expect(call.checkNoMoreArgs()).toBe(false);
                
                expect(call.getNextShort()).toBe(700);
                expect(call.checkNoMoreArgs()).toBe(false);
                
                expect(call.getNextLong()).toBe(200000);
                expect(call.checkNoMoreArgs()).toBe(false);
                
                expect(call.getNextFloat()).toBe(3.14);
                expect(call.checkNoMoreArgs()).toBe(false);
                
                expect(call.getNextDouble()).toBe(6.28);
                expect(call.checkNoMoreArgs()).toBe(false);

                expect(call.getNextDateTime().toISOString()).toBe("2020-12-31T12:34:56.789Z");
                expect(call.checkNoMoreArgs()).toBe(false);

                expect(call.getNextDate().toISOString()).toBe("2020-12-31T00:00:00.000Z");
                expect(call.checkNoMoreArgs()).toBe(true);
            });
        });

        it("Should should read Element response", function() {
            const xml = '<root att="Hello"><child/></root>';
            const delegate = function(options) { 
                return Promise.resolve(makeSOAPResponse("Date", "p", "ns:Element", xml)); 
            };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                const el = 
                expect(DomUtil.toXMLString(call.getNextElement())).toBe(xml);
                expect(call.checkNoMoreArgs()).toBe(true);
            });
        });

        it("Should check response type", function() {
            const delegate = function(options) { 
                return Promise.resolve(makeSOAPResponse("Date", "p", "xsd:string", "Hello" )); 
            };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                expect(() => call.getNextByte()).toThrow();         // should use getNextString
            });
        });


        it("Should should read Document response", function() {
            const xml = '<root att="Hello"><child/></root>';
            const delegate = function(options) { 
                return Promise.resolve(makeSOAPResponse("Date", "p", "ns:Document", xml)); 
            };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                expect(DomUtil.toXMLString(call.getNextDocument())).toBe(xml);
                expect(call.checkNoMoreArgs()).toBe(true);
            });
        });

        it("Should should read empty Element response", function() {
            const delegate = function(options) { 
                return Promise.resolve(makeSOAPResponse("Date", "p", "ns:Element", "")); 
            };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                expect(call.getNextElement()).toBeNull();
            });
        });

        it("Should should read empty Document response", function() {
            const delegate = function(options) { 
                return Promise.resolve(makeSOAPResponse("Date", "p", "ns:Document", "")); 
            };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                expect(call.getNextDocument()).toBeNull();
            });
        });

        it("Should not read element past end", function() {
            const delegate = function(options) { return Promise.resolve(makeSOAPResponse("Date")); };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                expect(() => call.getNextElement()).toThrow();
            });
        });

        it("Should not read document past end", function() {
            const delegate = function(options) { return Promise.resolve(makeSOAPResponse("Date")); };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).then(() => {
                expect(() => call.getNextDocument()).toThrow();
            });
        });
    });


    describe("Handle SOAP faults", function() {

        it("Should simulate SOAP fault", function() {
            const delegate = function(options) { 
                return Promise.resolve(makeSOAPFault("-53", "failed", "The SOAP call failed")); 
            };
            const call = makeSoapMethodCall("xtk:session", "Date", "$session$", "$security$", delegate);
            return call.execute(URL).catch(e => {
                expect(e.faultcode).toMatch("-53");
                expect(e.faultstring).toMatch("failed");
            });
        });
    });
    
});

                