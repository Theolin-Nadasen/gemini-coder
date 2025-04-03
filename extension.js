const vscode = require('vscode');
const { GoogleGenerativeAI } = require("@google/generative-ai");


const systemInstruction = `You are an expert code assistant integrated into VS Code. Your task is to clean up the user's code.
Rules:
- Focus on improving readability, removing redundancy, and applying best practices (Do only what the user asks for).
- Do not rename variable and function names unless asked by the user.
- preserve tabs and spaces unless asked by the user. you may only be getting part of the code and it may be important.
- Do not add any comment at the top of the code.
- Do not assume any franework is being used unless it is obvious from the code provided or the user specifies this.
- If you include an import or something and additional setup is required by the user, leave a comment explaining how to install the required tool.
- Add concise comments ONLY above lines or blocks of code you have significantly changed, explaining the reason for the change.
- Preserve the original functionality. Do not make unnecessary changes if the code is already clean and functional.
- IMPORTANT: Respond ONLY with the complete, modified code. Do not include any introductory phrases (like "Here's the cleaned code:"), concluding remarks, or markdown code fences (\`\`\`). Just the raw code.`;


function getSelectionRange() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null; // No active editor

    const selection = editor.selection;
    
    // Check if text is selected (not just a cursor)
    if (!selection.isEmpty) {
		console.log("sending selected text");
        return selection;
    }
    
	console.log("no text selected. sending file contents")
    return null; // No text selected
}

async function promptUserForInput(question) {
    const input = await vscode.window.showInputBox({
        placeHolder: "Create a function to print 'hello world'", // Optional placeholder text
        prompt: question // Optional message to show above the input box
    });

    if (input) {
        console.log("Input was received: " + input);
        return input;
    } else {
        return null;
    }
}

async function promptTheModel(thePrompt){


	        // Check if the API key is set

			const config = vscode.workspace.getConfiguration('gemini-coder');
			// Retrieve the specific setting value using its key ('apiKey')
			const GEMINI_API_KEY = config.get('apiKey');
			const SELECTED_MODEL = config.get('modelName');

			console.log(SELECTED_MODEL);
	
			if (!GEMINI_API_KEY) {
				vscode.window.showErrorMessage(
					'Gemini API key is not configured. Please set it in VS Code Settings.',
					'Open Settings' // Add an action button
				).then(selection => {
					// If the user clicks "Open Settings", open the settings UI to the specific setting
					if (selection === 'Open Settings') {
						vscode.commands.executeCommand('workbench.action.openSettings', 'gemini-coder');
					}
				});
				return; // Stop execution if no key
			}
			// --- END OF API KEY HANDLING ---
	
	
			vscode.window.showInformationMessage("model is generating");
	
			// check if the user selected text
			const selectedText = getSelectionRange();
	
			let userCode = null;
			const codeLanguage = vscode.window.activeTextEditor.document.languageId;
	
			if (selectedText){
				userCode = vscode.window.activeTextEditor.document.getText(selectedText);
			} else{
				userCode = vscode.window.activeTextEditor.document.getText();
			}
			// end of getting selected text
	
			const prompt = "language : " + codeLanguage + " | "  + thePrompt +  userCode;
	
			// get the model
			const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
			const model = genAI.getGenerativeModel({model : SELECTED_MODEL, systemInstruction : systemInstruction});
	
			try {
				// prompt the model
				const result = await model.generateContent(prompt);
				const responseText = await result.response.text();
	
	
				const editor = vscode.window.activeTextEditor;
	
				const proceed = await vscode.window.showInformationMessage("Apply suggested changes?", {modal : true}, "yes", "show code (manual)")
	
				if(proceed === "yes"){
					await editor.edit(editbuilder => {
						const fullRange = new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length));
	
						if(selectedText){
							editbuilder.replace(selectedText, responseText);
							
						}else{
							editbuilder.replace(fullRange, responseText);
						}
						
					});
				}else{

					try {
						// Encode the content to be safely included in a URI query
						const encodedContent = encodeURIComponent(responseText);
				
						// Create a unique URI using your custom scheme
						const timestamp = Date.now();
						const randomPart = Math.random().toString(36).substring(2, 8); // Simple random string
						const virtualDocUri = vscode.Uri.parse(
							`gemini-suggestion:output-${timestamp}-${randomPart}.txt?${encodedContent}`
						);
				
						// 3. Open the virtual document in a new editor tab
						const doc = await vscode.workspace.openTextDocument(virtualDocUri); // Open in memory
						await vscode.window.showTextDocument(doc, { // Show it in an editor
							viewColumn: vscode.ViewColumn.Beside, // Open beside the current editor
							preserveFocus: false, // Move focus to the new editor
							preview: false // Make it a "real" tab, not a preview
						});
				
						console.log(`Displayed content in temporary URI: ${virtualDocUri.toString()}`);
				
					} catch (error) {
						console.error("Failed to display content in temporary file:", error);
						vscode.window.showErrorMessage("Could not display the information in a temporary tab.");
					}


					vscode.window.showInformationMessage("Code not changed.");
				}
				
			}
			catch(error) {
				vscode.window.showErrorMessage('failed to generate code');
				console.log(error)
			}


}



/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Gemini Coder is running');

	// provider for the display that shows suggestions
	const suggestionProvider = vscode.workspace.registerTextDocumentContentProvider('gemini-suggestion', {
        provideTextDocumentContent(uri) {
            // Decode the content from the URI query
            try {
                const decodedContent = decodeURIComponent(uri.query);
                return decodedContent;
            } catch (e) {
                console.error("Failed to decode URI content:", e);
                return `// Error: Failed to load suggestion content`;
            }
        }
    });
    context.subscriptions.push(suggestionProvider);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('gemini-coder.clean', async function () {
		// The code you place here will be executed every time your command is executed

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "AI is cleaning your code...",
				cancellable: false, // Prevents cancellation
			},
			async (progress) => {
				progress.report({ message: "Generating improvements..." });
	
				// Call your AI function and wait for the result
				await promptTheModel("Please clean up this code and comment above every change that was made. Do not make unnecessary changes because the code already works. code :");
	
			}
		)

		// promptTheModel("please clean up this code and comment above every change that was made. Do not make unnecessary changes because the code already works. code :")

		// Display a message box to the user
		
	});

	context.subscriptions.push(disposable);

	// Adds comments to your code
	const addComments = vscode.commands.registerCommand('gemini-coder.comment', async function () {
		// function for adding comments to code

		await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "AI is adding comments to your code...",
                cancellable: false, // Prevents cancellation
            },
            async (progress) => {
                progress.report({ message: "Generating comments..." });
    
                // Call your AI function and wait for the result
                await promptTheModel("please add comments to this code as a human would. do not go too far with the comments. Do not make any changes to the code other than the comments. code :");
    
            }
        )

	});

	context.subscriptions.push(addComments);

	// Generates code
	const generateCode = vscode.commands.registerCommand('gemini-coder.generate', async function () {
		// function for generating code

		const userInput = await promptUserForInput("Please describe what you would like generated or how you would like the current code to be changed :")

		if(!userInput){
			console.log("user input is null");
			return;
		}

		await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "AI is generating your code...",
                cancellable: false, // Prevents cancellation
            },
            async (progress) => {
                progress.report({ message: "Generating code..." });
    
                // Call your AI function and wait for the result
                await promptTheModel(`
					please change the code according to the user input :
					${userInput}

					if no code is provided, assume the user wants you to generate code from scratch.

					code:
					`);
    
            }
        )

	});

	context.subscriptions.push(generateCode);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
