import { DiffEditorModel } from 'ngx-monaco-editor';
import { isBoolean, isString, isNumber } from 'util';

export class ChangeAnalysisUtilities {
    public static  prepareDisplayValueForTable(displayName: string): string {
        displayName = displayName.replace("D:\\home\\site\\wwwroot", "");
        return displayName;
    }

      public static prepareValuesForDiffView(diffvalue: any): DiffEditorModel {
        try {
            let jsonObject: any;
            if(diffvalue === null || typeof diffvalue === 'undefined') {
                return {
                    "code": "",
                    "language": 'text/plain'
                }
            }
            if(isBoolean(diffvalue) || isNumber(diffvalue)) {
                return {
                    "code": diffvalue.toString(),
                    "language": 'text/plain'
                };
            }
            if(isString(diffvalue)) {
                diffvalue = diffvalue.replace("mtime", "Modified Time");
                diffvalue = diffvalue.replace("crtime", "Created Time");
                jsonObject = JSON.parse(diffvalue);
                if(jsonObject.hasOwnProperty('content') && jsonObject['content'] != null) {
                    return {
                        "code": jsonObject['content'],
                        "language": 'text/plain'
                    };
                } return {
                    "code": JSON.stringify(jsonObject, null, 2),
                    'language': 'json'
                };
            }
            if(diffvalue instanceof Object || diffvalue instanceof Array ) {
                if(diffvalue.hasOwnProperty('content') && diffvalue['content'] != null) {
                    return {
                        "code": diffvalue['content'],
                        "language": 'text/plain'
                    };
                } return {
                    // Needed for JSON Pretty
                    "code": JSON.stringify(diffvalue, null, 2),
                    "language": 'json'
                    };
            }
        // Exception is thrown when we try to parse string which is not a json, so just return text/plain
        } catch(ex) {
            return {
                "code": diffvalue,
                "language": 'text/plain'
            }
        }
    }

    public static getDataSourceFromChangesetId(changesetId: string): string {
        let splits = changesetId ? changesetId.split('_') : [];
        return splits.length > 0 ? splits[0] : null;
    }

    public static findGroupBySource(source: string): number {
        source = source.toUpperCase();
        switch(source){
        case "ARG":
        return 1;
        case "ARM":
        return 1;
        case "AST":
        return 2;
        default:
        return 1;
        }
    }
}
