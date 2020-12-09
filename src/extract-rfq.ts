import * as capitano from 'capitano';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as Path from 'path';
import * as readline from 'readline';


const generate = async (
	params: { folder: string },
	options: { output: string },
) => {
	
	// get the .kicad_pcb file from src directory
    var files = fs.readdirSync(Path.join(params.folder, 'src')).filter(fn => fn.endsWith('.kicad_pcb'));
    var jsonResult : string = "";
    console.log(Path.join(params.folder, 'src', files[0]))

    //Extract the fabrication notes from the file
    parseFile(Path.join(params.folder, 'src', files[0]), (callback:string) => {
        jsonResult = callback;
        console.log(jsonResult)
    }).then(_value => {
        fs.writeFileSync(Path.join(options.output, `rfq.json`), jsonResult, 'binary');
    });
};

const parseFile = async (path: string, callback:any) => {
    let extractedParams: any;
    let numSmd: number = 0;
    let numTh: number = 0;
    let jsonString : string;
    let layers : string[] = [];
    let lineReader = readline.createInterface({
        input: fs.createReadStream(path)
        });

    return new Promise((resolve) => {
        lineReader.on('line', async function(line) {
            if (line.includes('Fabrication Notes')) {
                const match = line.match(/"([^"]+)"/);
                if(match != null){
                    const pcbParams = match[1].split('\\n- ');
                    //remove the title
                    pcbParams.splice(0,1);
                    
                    // extract the parameters from the fabrication layer notes
                    extractedParams = await getAllPcbParameters(pcbParams);
                }
            }

            if (line.includes('(type "')){
                // extract the stackup information
                var match = line.match(/"([^"]+)"/);
                if(match != null){
                    layers.push(match[1]);
                }
            }

            if (line.includes('(attr')){
                line = line.replace('    ', '');
                line = line.replace('(', '');
                line = line.replace(')', '');
                const lines = line.split(' ');

                if(lines[1] == 'smd'){
                    numSmd += 1;
                } else if(lines[1] == 'through_hole'){
                    numTh += 1;
                }
            }
         });

        // when the file has been read
        lineReader.on('close', async function() {
            // put both parameters and stackup into json string
            extractedParams['Stackup'] = layers;
            extractedParams['NumSMD'] = numSmd;
            extractedParams['NumTH'] = numTh;
            extractedParams['NumTotal'] = numSmd + numTh;
            jsonString =  JSON.stringify(extractedParams);
            callback(jsonString);
            resolve();
        })
    });
}

const getPcbParameter = async (line: string) => {
    const splitLine = line.split(': ');
    const name = splitLine[0]
    const value = splitLine[1]
    return {
        name: name,
        value:value
    }
};

const getAllPcbParameters = async (list: string[]) => {
    let extractedParams: any = {}
    for(var item in list){
        const param = await getPcbParameter(list[item]);
        extractedParams[param.name] = param.value;
    }
    return extractedParams;
}


capitano.command({
	signature: 'generate <folder>',
	description: 'Generate a target-specific RFQ from a repository',
	options: [
		{
			signature: 'output',
			parameter: 'output',
			alias: ['o'],
			description: 'Output directory, defaults to path if not specified',
		},
	],
	action: generate
});

capitano.run(process.argv, (err: Error | null) => {
	if (err != null) {
		throw err;
	}
});
