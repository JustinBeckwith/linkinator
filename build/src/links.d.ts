/// <reference types="node" />
import { URL } from 'url';
export interface ParsedUrl {
    link: string;
    error?: Error;
    url?: URL;
}
export declare function getLinks(source: string, baseUrl: string): ParsedUrl[];
