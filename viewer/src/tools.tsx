import { parse, X2jOptions } from 'fast-xml-parser';
import he from 'he';

const XML_PARSER_OPTIONS: Partial<X2jOptions> = {
    ignoreAttributes: false,
    parseAttributeValue: true,
    tagValueProcessor: a => he.decode(a),
    attrValueProcessor: a => he.decode(a, { isAttributeValue: true })
};

/**
 * Parses XML data to a javascript object
 * @param data 
 * @returns a javascript object representation of the xml data tree
 */
export function xmlToJSON(data: any): any {
    return parse(data, XML_PARSER_OPTIONS);
}
