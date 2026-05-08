// Copyright (c) 2025 Stefano Scafiti
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
package format

import (
	"encoding/binary"
	"fmt"
)

// isobmffSignatures returns byte signatures for ISOBMFF-based files.
//
// Covered cases:
//  1. ftyp as first atom  — sizes 16–96 bytes (covers all known cameras)
//  2. free / wide / skip as first atom (8 bytes) — Canon and some QuickTime files
//     write one of these tiny atoms before ftyp
func isobmffSignatures() [][]byte {
	var sigs [][]byte

	// ftyp box at offset 0, sizes 16–96 bytes in multiples of 4
	for sz := byte(0x10); sz <= 0x60; sz += 4 {
		sigs = append(sigs, []byte{0x00, 0x00, 0x00, sz, 'f', 't', 'y', 'p'})
	}

	// 8-byte "free", "wide", "skip" atoms that some cameras write before ftyp
	sigs = append(sigs,
		[]byte{0x00, 0x00, 0x00, 0x08, 'f', 'r', 'e', 'e'},
		[]byte{0x00, 0x00, 0x00, 0x08, 'w', 'i', 'd', 'e'},
		[]byte{0x00, 0x00, 0x00, 0x08, 's', 'k', 'i', 'p'},
	)

	return sigs
}

var mp4FileHeader = FileHeader{
	Ext:         "mp4",
	Description: "MPEG-4 / QuickTime / Canon RAW 3 (ISOBMFF)",
	Signatures:  isobmffSignatures(),
	ScanFile:    ScanISOBMFF,
}

// brandExt maps ftyp major brand bytes to the output file extension.
var brandExt = map[[4]byte]string{
	{'q', 't', ' ', ' '}: "mov",
	{'c', 'r', 'x', ' '}: "cr3",
	{'M', '4', 'V', ' '}: "mp4",
	{'M', '4', 'A', ' '}: "m4a",
	{'m', 'p', '4', '1'}: "mp4",
	{'m', 'p', '4', '2'}: "mp4",
	{'i', 's', 'o', 'm'}: "mp4",
	{'a', 'v', 'c', '1'}: "mp4",
	{'h', 'e', 'v', '1'}: "mp4",
	{'h', 'e', 'v', 'c'}: "mp4",
	{'f', '4', 'v', ' '}: "mp4",
}

// ScanISOBMFF walks the top-level box structure of an ISO Base Media File
// Format stream (MP4, MOV, CR3) and returns the total size.
// It handles files that begin with a "free", "wide", or "skip" atom before ftyp.
func ScanISOBMFF(r *Reader) (*ScanResult, error) {
	ext := ""

	for {
		var hdr [8]byte
		n, err := r.Read(hdr[:])
		if n < 8 {
			break
		}
		if err != nil {
			break
		}

		boxSize32 := binary.BigEndian.Uint32(hdr[:4])
		boxType := string(hdr[4:8])

		var dataSize uint64
		switch boxSize32 {
		case 0:
			// Box extends to end of file — treat as end of this file.
			return &ScanResult{Ext: resolveISOExt(ext), Size: r.BytesRead()}, nil
		case 1:
			// 64-bit extended size immediately follows the type.
			var ext64 [8]byte
			n, err = r.Read(ext64[:])
			if n < 8 || err != nil {
				return &ScanResult{Ext: resolveISOExt(ext), Size: r.BytesRead()}, nil
			}
			fullSize := binary.BigEndian.Uint64(ext64[:])
			if fullSize < 16 {
				return nil, fmt.Errorf("invalid extended box size %d", fullSize)
			}
			dataSize = fullSize - 16
		default:
			if boxSize32 < 8 {
				return nil, fmt.Errorf("invalid box size %d", boxSize32)
			}
			dataSize = uint64(boxSize32) - 8
		}

		if boxType == "ftyp" && ext == "" && dataSize >= 4 {
			var brand [4]byte
			n, err := r.Read(brand[:])
			if n < 4 || err != nil {
				return &ScanResult{Ext: resolveISOExt(ext), Size: r.BytesRead()}, nil
			}
			if e, ok := brandExt[brand]; ok {
				ext = e
			} else {
				ext = "mp4"
			}
			dataSize -= 4
		}

		if dataSize > 0 {
			discarded, err := r.Discard(int(dataSize))
			if err != nil || uint64(discarded) < dataSize {
				return &ScanResult{Ext: resolveISOExt(ext), Size: r.BytesRead()}, nil
			}
		}
	}

	return &ScanResult{Ext: resolveISOExt(ext), Size: r.BytesRead()}, nil
}

func resolveISOExt(ext string) string {
	if ext == "" {
		return "mp4"
	}
	return ext
}
