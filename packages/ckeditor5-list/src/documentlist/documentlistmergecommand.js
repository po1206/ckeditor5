/**
 * @license Copyright (c) 2003-2021, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module list/documentlist/documentlistmergecommand
 */

import { Command } from 'ckeditor5/src/core';
import {
	getNestedListBlocks,
	indentBlocks,
	sortBlocks,
	isFirstBlockOfListItem,
	mergeListItemBefore,
	isSingleListItem,
	isListItemBlock
} from './utils/model';
import ListWalker from './utils/listwalker';

/**
 * TODO
 * The document list indent command. It is used by the {@link module:list/documentlist~DocumentList list feature}.
 *
 * @extends module:core/command~Command
 */
export default class DocumentListMergeCommand extends Command {
	/**
	 * Creates an instance of the command.
	 *
	 * @param {module:core/editor/editor~Editor} editor The editor instance.
	 * @param {'backward'|'forward'} direction Whether list item should be merged before or after the selected block.
	 */
	constructor( editor, direction ) {
		super( editor );

		/**
		 * Whether list item should be merged before or after the selected block.
		 *
		 * @readonly
		 * @private
		 * @member {'backward'|'forward'}
		 */
		this._direction = direction;
	}

	/**
	 * @inheritDoc
	 */
	refresh() {
		this.isEnabled = this._checkEnabled();
	}

	/**
	 * TODO
	 *
	 * @fires execute
	 * @fires afterExecute
	 */
	execute() {
		const model = this.editor.model;
		const selection = model.document.selection;
		const changedBlocks = [];

		model.change( writer => {
			const shouldMergeOnBlocksContentLevel = this._shouldMergeOnBlocksContentLevel();
			const { firstElement, lastElement } = this._getBoundaryElements( selection, shouldMergeOnBlocksContentLevel );

			const firstIndent = firstElement.getAttribute( 'listIndent' ) || 0;
			const lastIndent = lastElement.getAttribute( 'listIndent' );
			const lastElementId = lastElement.getAttribute( 'listItemId' );

			if ( firstIndent != lastIndent ) {
				const nestedLastElementBlocks = getNestedListBlocks( lastElement );

				changedBlocks.push( ...indentBlocks( [ lastElement, ...nestedLastElementBlocks ], writer, {
					indentBy: firstIndent - lastIndent,

					// If outdenting, the entire sub-tree that follows must be included.
					expand: firstIndent < lastIndent
				} ) );
			}

			if ( shouldMergeOnBlocksContentLevel ) {
				let sel = selection;

				if ( selection.isCollapsed ) {
					// TODO what if one of blocks is an object (for example a table or block image)?
					sel = writer.createSelection( writer.createRange(
						writer.createPositionAt( firstElement, 'end' ),
						writer.createPositionAt( lastElement, 0 )
					) );
				}

				// Delete selected content. Replace entire content only for non-collapsed selection.
				model.deleteContent( sel, { doNotResetEntireContent: selection.isCollapsed } );

				// Get the last "touched" element after deleteContent call (can't use the lastElement because
				// it could get merged into the firstElement while deleting content).
				const lastElementAfterDelete = sel.getLastPosition().parent;

				// Check if the element after it was in the same list item and adjust it if needed.
				const nextSibling = lastElementAfterDelete.nextSibling;

				changedBlocks.push( lastElementAfterDelete );

				if ( nextSibling && nextSibling !== lastElement && nextSibling.getAttribute( 'listItemId' ) == lastElementId ) {
					changedBlocks.push( ...mergeListItemBefore( nextSibling, lastElementAfterDelete, writer ) );
				}
			} else {
				changedBlocks.push( ...mergeListItemBefore( lastElement, firstElement, writer ) );
			}

			this._fireAfterExecute( changedBlocks );
		} );
	}

	/**
	 * TODO
	 *
	 * @private
	 * @param {Array.<module:engine/model/element~Element>} changedBlocks The changed list elements.
	 */
	_fireAfterExecute( changedBlocks ) {
		/**
		 * Event fired by the {@link #execute} method.
		 *
		 * It allows to execute an action after executing the {@link ~DocumentListIndentCommand#execute} method,
		 * for example adjusting attributes of changed list items.
		 *
		 * @protected
		 * @event afterExecute
		 */
		this.fire( 'afterExecute', sortBlocks( new Set( changedBlocks ) ) );
	}

	/**
	 * Checks whether the command can be enabled in the current context.
	 *
	 * @private
	 * @returns {Boolean} Whether the command should be enabled.
	 */
	_checkEnabled() {
		const model = this.editor.model;
		const selection = model.document.selection;

		const shouldMergeOnBlocksContentLevel = this._shouldMergeOnBlocksContentLevel();
		const { firstElement, lastElement } = this._getBoundaryElements( selection, shouldMergeOnBlocksContentLevel );

		if ( shouldMergeOnBlocksContentLevel ) {
			return isListItemBlock( lastElement );
			// return isListItemBlock( firstElement ) && isListItemBlock( lastElement );
		} else {
			return isListItemBlock( firstElement );
		}

		// let sel = selection;

		// if ( selection.isCollapsed ) {
		// 	// TODO what if one of blocks is an object (for example a table or block image)?
		// 	sel = writer.createSelection( writer.createRange(
		// 		writer.createPositionAt( firstElement, 'end' ),
		// 		writer.createPositionAt( lastElement, 0 )
		// 	) );
		// }

		// // Delete selected content. Replace entire content only for non-collapsed selection.
		// model.deleteContent( sel, { doNotResetEntireContent: selection.isCollapsed } );

		// // Get the last "touched" element after deleteContent call (can't use the lastElement because
		// // it could get merged into the firstElement while deleting content).
		// const lastElementAfterDelete = sel.getLastPosition().parent;

		// // Check if the element after it was in the same list item and adjust it if needed.
		// const nextSibling = lastElementAfterDelete.nextSibling;

		// changedBlocks.push( lastElementAfterDelete );

		// if ( nextSibling && nextSibling !== lastElement && nextSibling.getAttribute( 'listItemId' ) == lastElementId ) {
		// 	changedBlocks.push( ...mergeListItemBefore( nextSibling, lastElementAfterDelete, writer ) );
		// }
	}

	/**
	 *
	 * @returns TODO
	 */
	_shouldMergeOnBlocksContentLevel() {
		const model = this.editor.model;
		const selection = model.document.selection;

		if ( !selection.isCollapsed || this._direction === 'forward' ) {
			return true;
		}

		const firstPosition = selection.getFirstPosition();
		const positionParent = firstPosition.parent;
		const previousSibling = positionParent.previousSibling;

		if ( model.schema.isObject( previousSibling ) ) {
			return false;
		}

		if ( previousSibling.isEmpty ) {
			return true;
		}

		return isSingleListItem( [ positionParent, previousSibling ] );
	}

	/**
	 * TODO
	 *
	 * @param {*} selection
	 * @param {*} shouldMergeOnBlocksContentLevel
	 * @returns
	 */
	_getBoundaryElements( selection, shouldMergeOnBlocksContentLevel ) {
		let firstElement, lastElement;

		if ( selection.isCollapsed ) {
			const positionParent = selection.getFirstPosition().parent;
			const isFirstBlock = isFirstBlockOfListItem( positionParent );

			if ( this._direction == 'backward' ) {
				lastElement = positionParent;

				if ( isFirstBlock && !shouldMergeOnBlocksContentLevel ) {
					// For the "c" as an anchorElement:
					//	* a
					//	  * b
					//  * [c]  <-- this block should be merged with "a"
					// It should find "a" element to merge with:
					//	* a
					//	  * b
					//    c
					firstElement = ListWalker.first( positionParent, { sameIndent: true, lowerIndent: true } );
				} else {
					firstElement = positionParent.previousSibling;
				}
			} else {
				// In case of the forward merge there is no case as above, just merge with next sibling.
				firstElement = positionParent;
				lastElement = positionParent.nextSibling;
			}
		} else {
			firstElement = selection.getFirstPosition().parent;
			lastElement = selection.getLastPosition().parent;
		}

		return { firstElement, lastElement };
	}
}
