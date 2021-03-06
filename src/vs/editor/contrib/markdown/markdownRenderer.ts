/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from 'vs/base/common/htmlContent';
import { renderMarkdown, MarkdownRenderOptions, MarkedOptions } from 'vs/base/browser/markdownRenderer';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Emitter } from 'vs/base/common/event';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { TokenizationRegistry } from 'vs/editor/common/modes';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { URI } from 'vs/base/common/uri';

export interface IMarkdownRenderResult extends IDisposable {
	element: HTMLElement;
}

export interface IMarkdownRendererOptions {
	editor?: ICodeEditor;
	baseUrl?: URI
}

export class MarkdownRenderer {

	private readonly _onDidRenderCodeBlock = new Emitter<void>();
	readonly onDidRenderCodeBlock = this._onDidRenderCodeBlock.event;

	constructor(
		private readonly _options: IMarkdownRendererOptions,
		@IModeService private readonly _modeService: IModeService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) { }

	dispose(): void {
		this._onDidRenderCodeBlock.dispose();
	}

	render(markdown: IMarkdownString | undefined, markedOptions?: MarkedOptions): IMarkdownRenderResult {
		const disposeables = new DisposableStore();

		let element: HTMLElement;
		if (!markdown) {
			element = document.createElement('span');
		} else {
			element = renderMarkdown(markdown, this._getOptions(disposeables), markedOptions);
		}

		return {
			element,
			dispose: () => disposeables.dispose()
		};
	}

	protected _getOptions(disposeables: DisposableStore): MarkdownRenderOptions {
		return {
			baseUrl: this._options.baseUrl,
			codeBlockRenderer: async (languageAlias, value) => {
				// In markdown,
				// it is possible that we stumble upon language aliases (e.g.js instead of javascript)
				// it is possible no alias is given in which case we fall back to the current editor lang
				let modeId: string | undefined | null;
				if (languageAlias) {
					modeId = this._modeService.getModeIdForLanguageName(languageAlias);
				} else if (this._options.editor) {
					modeId = this._options.editor.getModel()?.getLanguageIdentifier().language;
				}
				if (!modeId) {
					modeId = 'plaintext';
				}
				this._modeService.triggerMode(modeId);
				await Promise.resolve(true);
				const promise = TokenizationRegistry.getPromise(modeId);
				if (promise) {
					return promise.then(support => tokenizeToString(value, support));
				}
				const code = tokenizeToString(value, undefined);
				return this._options.editor
					? `<span style="font-family: ${this._options.editor.getOption(EditorOption.fontInfo).fontFamily}">${code}</span>`
					: `<span>${code}</span>`;
			},
			codeBlockRenderCallback: () => this._onDidRenderCodeBlock.fire(),
			actionHandler: {
				callback: (content) => {
					this._openerService.open(content, { fromUserGesture: true }).catch(onUnexpectedError);
				},
				disposeables
			}
		};
	}
}
